"use server";

import { hojeParaBanco } from "@/lib/data";
import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { casarCobrancaManualComPrevisao } from "@/modules/juridico/contrato/previsao-service";
import { prisma } from "@/lib/prisma";
import {
  criarLancamentoSchema,
  editarLancamentoSchema,
  confirmarLancamentoSchema,
  idLancamentoSchema,
  prioridadeLancamentoSchema,
  confiancaLancamentoSchema,
  caixinhaLancamentoSchema,
} from "@/modules/financeiro/lancamentos/schemas";
import { z } from "zod";
import { removerArquivo } from "@/lib/storage";
import { criarLancamentoNoTx, notificarAprovacaoPendente } from "@/modules/financeiro/lancamentos/service";
import { getNiveisAprovacao, valorParaAlcada } from "@/modules/financeiro/aprovacao/queries";
import { situacaoAposMudarValor } from "@/modules/financeiro/aprovacao/niveis";
import { camposDoPlanejador, saldoRestante } from "@/modules/financeiro/lancamentos/parcial";
import { pagamentoPagoNoFinanceiro } from "@/modules/financeiro/custo/lancamento-custo";
import { exigirOperacao, estornarNoBanco, MOTIVO_MUDOU, reabrirNoBanco } from "@/modules/financeiro/lancamentos/situacao-service";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { datasDoLancamento, exigirPeriodoAberto } from "@/modules/financeiro/fechamento/trava-service";
import { edicaoMexeNoFechado } from "@/modules/financeiro/fechamento/trava";
import { motivoCategoriaIncompativel } from "@/modules/financeiro/categorias-regras";
import { getExclusaoCompleto } from "@/modules/financeiro/config/queries";
import { verificarSenha } from "@/modules/financeiro/config/senha";
import { corrigirPagamentoNoBanco } from "@/modules/financeiro/lancamentos/corrigir-pagamento";
import { corrigirPagamentoSchema } from "@/modules/financeiro/transferencias/schemas";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;

function rev() {
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/contas-a-pagar");
  revalidatePath("/financeiro/contas-a-receber");
  revalidatePath("/financeiro/relatorios");
  revalidatePath("/financeiro/planejador");
}

function data(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

/** Snapshot JSON-safe do lançamento p/ auditoria valor-anterior × novo. */
async function snapshotLancamento(id: string) {
  const l = await prisma.lancamento.findUnique({
    where: { id },
    select: {
      valor: true, valorEfetivo: true, status: true, descricao: true, vencimento: true,
      categoriaId: true, centroId: true, projetoId: true, fornecedorId: true, clienteId: true, observacao: true,
      // Campos do planejador: sem eles a auditoria não vê a troca de prioridade/confiança.
      prioridade: true, confianca: true, transferenciaId: true, caixinhaId: true, socioId: true,
      recorrenciaOrigemId: true, recorrenciaCompetencia: true,
    },
  });
  if (!l) return null;
  return {
    ...l,
    valor: Number(l.valor),
    valorEfetivo: l.valorEfetivo != null ? Number(l.valorEfetivo) : null,
    vencimento: l.vencimento ? l.vencimento.toISOString().slice(0, 10) : null,
  };
}

export const criarLancamento = defineAction(
  { ...base, acao: "criar-lancamento", entidade: "Lancamento", schema: criarLancamentoSchema },
  async (i, { user }) => {
    // Validação (obrigatórios, alçada) e gravação no serviço: o "aplicar cenário" do planejador
    // passa pelas mesmas regras, dentro da transação dele.
    const criado = await criarLancamentoNoTx(prisma, i, user.id);

    // Decisão #12: receita de projeto lançada à mão pode ser a cobrança de uma parcela que o cronograma
    // ainda mostra como PREVISÃO — as duas linhas somariam no caixa. Só lançamento único (com id);
    // recorrência não é parcela de entrega.
    let casamento: {
      casou: boolean;
      parcela: string | null;
      aviso: string | null;
      previsaoRemovidaId: string | null;
    } | null = null;
    if (criado.id && criado.vencimentoOuData && i.tipo === "receita" && i.projetoId && criado.status !== "aguardando_aprovacao") {
      try {
        casamento = await casarCobrancaManualComPrevisao({
          lancamentoId: criado.id,
          projetoId: i.projetoId,
          valor: i.valor,
          vencimento: criado.vencimentoOuData,
          autorId: user.id,
        });
      } catch (e) {
        // O lançamento JÁ existe: falhar aqui faria a tela mostrar erro e a pessoa lançar de novo,
        // duplicando a receita. O casamento é um extra — sem ele, sobra a previsão, que está à vista.
        casamento = {
          casou: false,
          parcela: null,
          aviso: `O lançamento foi criado, mas não foi possível casá-lo com a previsão do cronograma${
            e instanceof Error && e.message.length < 160 ? `: ${e.message}` : "."
          } Confira a previsão na tela do contrato.`,
          previsaoRemovidaId: null,
        };
      }
    }
    if (criado.precisaAprovar) await notificarAprovacaoPendente(i.descricao, i.valor, user.id);
    rev();
    return {
      ocorrencias: criado.ocorrencias,
      aguardandoAprovacao: criado.precisaAprovar,
      /** Decisão #12: a parcela cuja previsão esta cobrança assumiu (`null` = nenhuma). */
      previsaoCasada: casamento?.casou ? casamento.parcela : null,
      /** Por que não casou, quando havia previsão no projeto e vale avisar. */
      avisoPrevisao: casamento?.aviso ?? null,
      /** Id da linha de previsão que saiu do caixa — fica no registro de auditoria desta ação. */
      previsaoRemovidaId: casamento?.previsaoRemovidaId ?? null,
    };
  },
);

export const editarLancamento = defineAction(
  { ...base, acao: "editar-lancamento", entidade: "Lancamento", schema: editarLancamentoSchema, capturarAntes: (i) => snapshotLancamento(i.id) },
  async (i, ctx) => {
    // Máquina de situações (N1): excluído, cancelado e previsão do cronograma não se editam aqui.
    const { lancamento: atual, estado } = await exigirOperacao(prisma, i.id, "editar");
    const valorMudou = paraCentavos(i.valor) !== paraCentavos(atual.valor);
    // N6: a categoria nova tem que ser do tipo do lançamento.
    const catNova = await prisma.categoriaFinanceira.findUnique({ where: { id: i.categoriaId }, select: { tipo: true } });
    if (!catNova) throw new ActionError("Categoria não encontrada.");
    const incompativel = motivoCategoriaIncompativel(atual.tipo, catNova.tipo);
    if (incompativel) throw new ActionError(incompativel);
    if (estado.conciliado && valorMudou) {
      throw new ActionError("Conciliado com o extrato: o valor não muda por aqui — desconcilie a transação antes.");
    }
    if (i.caixinhaId !== undefined) await validarCaixinhaDoLancamento(atual, i.caixinhaId);
    // N5: mês fechado congela valor, categoria, datas, centro e projeto — descrição, vencimento,
    // observação, contato e campos do planejador continuam editáveis.
    const travados = await prisma.lancamento.findUniqueOrThrow({
      where: { id: i.id },
      select: { categoriaId: true, centroId: true, projetoId: true, contaId: true },
    });
    const novaData = data(i.data);
    const novaComp = data(i.dataCompetencia || undefined) ?? null;
    if (
      edicaoMexeNoFechado(
        { ...travados, valor: paraCentavos(atual.valor), data: atual.data, dataCompetencia: atual.dataCompetencia },
        {
          valor: paraCentavos(i.valor),
          categoriaId: i.categoriaId,
          data: novaData,
          dataCompetencia: novaComp,
          centroId: i.centroId || null,
          projetoId: i.projetoId || null,
        },
      )
    ) {
      await exigirPeriodoAberto(prisma, [...datasDoLancamento(atual), novaComp ?? novaData]);
    }
    // Alçada única (N3): despesa em aberto cujo VALOR mudou é reavaliada pelo total do parcelamento —
    // já aprovada volta para a aprovação (aprovaram outro valor); abaixo da faixa, é liberada.
    const novaSituacao = valorMudou
      ? situacaoAposMudarValor({
          tipo: atual.tipo,
          status: estado.status,
          valorAlcada: await valorParaAlcada(prisma, atual, i.valor),
          faixas: await getNiveisAprovacao(),
        })
      : null;
    await prisma.lancamento.update({
      where: { id: i.id },
      data: {
        // Planejador: ausente = não mexe; prioridade só em despesa, confiança só em receita.
        ...(i.prioridade !== undefined ? { prioridade: atual.tipo === "despesa" ? i.prioridade : null } : {}),
        ...(i.confianca !== undefined ? { confianca: atual.tipo === "receita" ? i.confianca : null } : {}),
        ...(i.caixinhaId !== undefined ? { caixinhaId: i.caixinhaId } : {}),
        descricao: i.descricao,
        valor: i.valor,
        data: data(i.data),
        vencimento: data(i.vencimento || undefined) ?? null,
        dataCompetencia: data(i.dataCompetencia || undefined) ?? null,
        categoriaId: i.categoriaId,
        centroId: i.centroId || null,
        projetoId: i.projetoId || null,
        fornecedorId: i.fornecedorId || null,
        clienteId: i.clienteId || null,
        observacao: i.observacao || null,
        ...(novaSituacao === "aguardando_aprovacao"
          ? { status: novaSituacao, aprovadoPorId: null, aprovadoEm: null, motivoRejeicao: null }
          : novaSituacao
            ? { status: novaSituacao }
            : {}),
        ...(novaSituacao && novaSituacao !== estado.status
          ? { statusHistorico: { create: { de: estado.status, para: novaSituacao, autorId: ctx.user.id } } }
          : {}),
      },
    });
    const foiParaAprovacao = novaSituacao === "aguardando_aprovacao";
    if (foiParaAprovacao) await notificarAprovacaoPendente(i.descricao, i.valor, ctx.user.id);
    rev();
    revalidatePath("/financeiro/aprovacoes");
    return { id: i.id, aguardandoAprovacao: foiParaAprovacao };
  },
);

/**
 * Planejador de caixa: prioridade/confiança mexem só no que ainda vai acontecer. Realizado e
 * cancelado não têm o que planejar (ADR-0007: confiança nunca vira status, e vice-versa).
 */
async function alvoPendente(id: string) {
  const l = await prisma.lancamento.findUnique({ where: { id }, select: { tipo: true, status: true, excluidoEm: true } });
  if (!l || l.excluidoEm) throw new ActionError("Lançamento não encontrado.");
  if (l.status === "confirmado") throw new ActionError("Já foi pago ou recebido: prioridade e confiança valem só para o que está em aberto.");
  if (l.status === "cancelado") throw new ActionError("Lançamento cancelado.");
  return l;
}

/**
 * Caixinha só troca em saída em ABERTO (I9): depois da baixa o uso já foi contado, e mexer na
 * caixinha de um pago reescreveria o reservado do passado — para isso há o movimento de ajuste.
 */
async function validarCaixinhaDoLancamento(l: { tipo: string; status: string }, caixinhaId: string | null) {
  if (caixinhaId === null) {
    if (l.status === "confirmado") throw new ActionError("Já foi pago: para corrigir o reservado, use um ajuste na caixinha.");
    return;
  }
  if (l.tipo !== "despesa") throw new ActionError("Só conta a pagar sai de caixinha.");
  if (l.status === "confirmado") throw new ActionError("Já foi pago: para corrigir o reservado, use um ajuste na caixinha.");
  if (l.status === "cancelado") throw new ActionError("Lançamento cancelado.");
  const c = await prisma.caixinha.findUnique({ where: { id: caixinhaId }, select: { ativo: true } });
  if (!c?.ativo) throw new ActionError("A caixinha escolhida não existe ou está inativa.");
}

export const definirCaixinhaLancamento = defineAction(
  {
    ...base,
    acao: "definir-caixinha-lancamento",
    entidade: "Lancamento",
    schema: caixinhaLancamentoSchema,
    capturarAntes: (i) => snapshotLancamento(i.id),
  },
  async (i) => {
    const l = await prisma.lancamento.findUnique({ where: { id: i.id }, select: { tipo: true, status: true, excluidoEm: true } });
    if (!l || l.excluidoEm) throw new ActionError("Lançamento não encontrado.");
    await validarCaixinhaDoLancamento(l, i.caixinhaId);
    await prisma.lancamento.update({ where: { id: i.id }, data: { caixinhaId: i.caixinhaId } });
    rev();
    revalidatePath("/financeiro/caixinhas");
    return { id: i.id };
  },
);

export const definirPrioridadeLancamento = defineAction(
  {
    ...base,
    acao: "definir-prioridade-lancamento",
    entidade: "Lancamento",
    schema: prioridadeLancamentoSchema,
    capturarAntes: (i) => snapshotLancamento(i.id),
  },
  async (i) => {
    const l = await alvoPendente(i.id);
    if (l.tipo !== "despesa") throw new ActionError("Só conta a pagar tem prioridade.");
    await prisma.lancamento.update({ where: { id: i.id }, data: { prioridade: i.prioridade } });
    rev();
    return { id: i.id };
  },
);

/** "Marcar como confirmada pelo cliente" (D1) e a volta ao padrão. Não recebe nada: só a confiança muda. */
export const definirConfiancaLancamento = defineAction(
  {
    ...base,
    acao: "definir-confianca-lancamento",
    entidade: "Lancamento",
    schema: confiancaLancamentoSchema,
    capturarAntes: (i) => snapshotLancamento(i.id),
  },
  async (i) => {
    const l = await alvoPendente(i.id);
    if (l.tipo !== "receita") throw new ActionError("Só conta a receber tem confiança.");
    await prisma.lancamento.update({ where: { id: i.id }, data: { confianca: i.confianca } });
    rev();
    return { id: i.id };
  },
);

/** Confirma (realiza) um lançamento previsto → entra no caixa/DRE. */
export const confirmarLancamento = defineAction(
  { ...base, acao: "confirmar-lancamento", entidade: "Lancamento", schema: confirmarLancamentoSchema, capturarAntes: (i) => snapshotLancamento(i.id) },
  async (i, ctx) => {
    const quando = data(i.dataConfirmacao || undefined) ?? hojeParaBanco();
    const restante = await prisma.$transaction(async (tx) => {
      await exigirOperacao(tx, i.id, "baixar");
      // N5: o pagamento não cai em mês fechado (a conta vencida de mês fechado se paga em mês aberto).
      await exigirPeriodoAberto(tx, [quando]);
      const lanc = await tx.lancamento.findUniqueOrThrow({ where: { id: i.id } });
      // Valor pago: usa o efetivo informado; se < total, o saldo vira um novo lançamento previsto.
      const restante = saldoRestante(Number(lanc.valor), i.valorEfetivo);

      // Condicionado à situação lida: duas baixas ao mesmo tempo não pagam duas vezes.
      const r = await tx.lancamento.updateMany({
        where: { id: i.id, status: "previsto", excluidoEm: null },
        data: {
          status: "confirmado",
          dataConfirmacao: quando,
          contaId: i.contaId || lanc.contaId,
          formaId: i.formaId || lanc.formaId,
          valorEfetivo: i.valorEfetivo ?? null,
        },
      });
      if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
      await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: i.id, de: lanc.status, para: "confirmado", autorId: ctx.user.id } });

      if (restante != null) {
        await tx.lancamento.create({
          data: {
            tipo: lanc.tipo,
            descricao: lanc.descricao,
            valor: restante,
            status: "previsto" as const,
            data: lanc.data,
            vencimento: lanc.vencimento,
            categoriaId: lanc.categoriaId,
            centroId: lanc.centroId,
            contaId: lanc.contaId,
            formaId: lanc.formaId,
            projetoId: lanc.projetoId,
            fornecedorId: lanc.fornecedorId,
            clienteId: lanc.clienteId,
            tags: lanc.tags,
            documentoFinanceiroId: lanc.documentoFinanceiroId,
            ...camposDoPlanejador(lanc),
            observacao: [lanc.observacao, "Saldo restante de pagamento parcial"].filter(Boolean).join(" · "),
            recorrenciaGrupo: lanc.recorrenciaGrupo ?? lanc.id,
            // N1: o estorno do pago acha o resto por aqui e o tira junto.
            restanteDeId: lanc.id,
            autorId: ctx.user.id,
            statusHistorico: { create: { de: null, para: "previsto", autorId: ctx.user.id } },
          },
        });
      }
      if (lanc.pagamentoProjetistaId) {
        await tx.pagamentoProjetista.updateMany(pagamentoPagoNoFinanceiro(lanc.pagamentoProjetistaId, quando));
      }
      return restante;
    });
    rev();
    return { id: i.id, restante };
  },
);

/** Baixa (confirma) vários lançamentos de uma vez. Ignora os já confirmados/aguardando. */
export const baixarEmLote = defineAction(
  {
    ...base,
    acao: "baixar-lancamentos-lote",
    entidade: "Lancamento",
    schema: z.object({
      ids: z.array(z.string().min(1)).min(1).max(500),
      contaId: z.string().optional().or(z.literal("")),
      formaId: z.string().optional().or(z.literal("")),
      dataConfirmacao: z.string().optional().or(z.literal("")),
    }),
  },
  async (i, ctx) => {
    const quando = data(i.dataConfirmacao || undefined) ?? hojeParaBanco();
    const alvos = await prisma.lancamento.findMany({
      where: { id: { in: i.ids }, status: "previsto" },
      select: { id: true, contaId: true, formaId: true, pagamentoProjetistaId: true },
    });
    if (alvos.length === 0) throw new ActionError("Nenhum lançamento elegível (previsto) selecionado.");

    await exigirPeriodoAberto(prisma, [quando]);
    // Um a um e condicionado ao previsto: o que mudou desde a leitura fica de fora, não é pago por cima.
    const confirmados = await prisma.$transaction(async (tx) => {
      let n = 0;
      for (const l of alvos) {
        const r = await tx.lancamento.updateMany({
          where: { id: l.id, status: "previsto", excluidoEm: null },
          data: { status: "confirmado", dataConfirmacao: quando, contaId: i.contaId || l.contaId, formaId: i.formaId || l.formaId },
        });
        if (r.count !== 1) continue;
        n++;
        await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: l.id, de: "previsto", para: "confirmado", autorId: ctx.user.id } });
        if (l.pagamentoProjetistaId) await tx.pagamentoProjetista.updateMany(pagamentoPagoNoFinanceiro(l.pagamentoProjetistaId, quando));
      }
      return n;
    });
    rev();
    return { confirmados, ignorados: i.ids.length - confirmados };
  },
);

// ── Tags e anexos do lançamento (A6) ──────────────────────────
export const salvarTagsLancamento = defineAction(
  { ...base, acao: "salvar-tags-lancamento", entidade: "Lancamento", schema: z.object({ id: z.string().min(1), tags: z.array(z.string().min(1)).max(20) }) },
  async (i) => {
    const tags = [...new Set(i.tags.map((t) => t.trim()).filter(Boolean))];
    await prisma.lancamento.update({ where: { id: i.id }, data: { tags } });
    rev();
    return { id: i.id };
  },
);

export const adicionarAnexoLancamento = defineAction(
  {
    ...base,
    acao: "add-anexo-lancamento",
    entidade: "LancamentoAnexo",
    schema: z.object({
      lancamentoId: z.string().min(1),
      meta: z.object({ caminho: z.string().min(1), nome: z.string().min(1), mime: z.string().min(1), tamanho: z.number().int().nonnegative() }),
    }),
  },
  async (i, ctx) => {
    const a = await prisma.lancamentoAnexo.create({
      data: { lancamentoId: i.lancamentoId, caminho: i.meta.caminho, nome: i.meta.nome, mime: i.meta.mime, tamanho: i.meta.tamanho, autorId: ctx.user.id },
    });
    rev();
    return { id: a.id };
  },
);

export const removerAnexoLancamento = defineAction(
  { ...base, acao: "rm-anexo-lancamento", entidade: "LancamentoAnexo", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const a = await prisma.lancamentoAnexo.findUnique({ where: { id: i.id }, select: { caminho: true } });
    if (!a) throw new ActionError("Anexo não encontrado.");
    await prisma.lancamentoAnexo.delete({ where: { id: i.id } });
    await removerArquivo(a.caminho);
    rev();
    return { id: i.id };
  },
);

export const cancelarLancamento = defineAction(
  { ...base, acao: "cancelar-lancamento", entidade: "Lancamento", schema: idLancamentoSchema, capturarAntes: (i) => snapshotLancamento(i.id) },
  async (i, ctx) => {
    // Máquina de situações (N1): produção e ART pela origem (G1b/D31), pago só depois de estornado,
    // conciliado nunca — a transação do banco ficaria "conciliada" com nada (A2).
    const { lancamento: l, estado } = await exigirOperacao(prisma, i.id, "cancelar");
    await exigirPeriodoAberto(prisma, datasDoLancamento(l));
    await prisma.$transaction(async (tx) => {
      const r = await tx.lancamento.updateMany({ where: { id: i.id, status: estado.status, excluidoEm: null }, data: { status: "cancelado" } });
      if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
      await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: i.id, de: estado.status, para: "cancelado", autorId: ctx.user.id } });
    });
    rev();
    return { id: i.id };
  },
);

/**
 * Estorna um pagamento ou recebimento (N1): volta a em aberto. Baixa parcial leva junto o saldo
 * restante ainda em aberto; receita distribuída tem a distribuição entre caixinhas desfeita.
 * Conciliado não estorna (desconcilie antes) e produção estorna pela tela de Produção.
 */
export const estornarLancamento = defineAction(
  { ...base, acao: "estornar-lancamento", entidade: "Lancamento", schema: idLancamentoSchema, capturarAntes: (i) => snapshotLancamento(i.id) },
  async (i, ctx) => {
    const r = await estornarNoBanco(i.id, ctx.user.id);
    rev();
    revalidatePath("/financeiro/caixinhas");
    return { id: i.id, ...r };
  },
);

/** Reabre um cancelado (N1): volta a em aberto, ou à fila de aprovação se tinha sido rejeitado. */
export const reabrirLancamento = defineAction(
  { ...base, acao: "reabrir-lancamento", entidade: "Lancamento", schema: idLancamentoSchema, capturarAntes: (i) => snapshotLancamento(i.id) },
  async (i, ctx) => {
    const r = await reabrirNoBanco(i.id, ctx.user.id);
    rev();
    revalidatePath("/financeiro/aprovacoes");
    return { id: i.id, ...r };
  },
);

export const excluirLancamento = defineAction(
  {
    ...base,
    acao: "excluir-lancamento",
    entidade: "Lancamento",
    schema: z.object({ id: z.string().min(1), senha: z.string().optional() }),
    capturarAntes: (i) => snapshotLancamento(i.id),
    redact: ["senha"],
  },
  async (i, ctx) => {
    const exclusao = await getExclusaoCompleto();
    if (exclusao.exigir && !verificarSenha(i.senha ?? "", exclusao.hash)) {
      throw new ActionError("Senha de exclusão incorreta.");
    }
    // Máquina de situações (N1): produção, ART, previsão, conciliado e receita distribuída não saem
    // por aqui; excluído de novo é recusado (A12).
    const { lancamento: l, estado } = await exigirOperacao(prisma, i.id, "excluir");
    await exigirPeriodoAberto(prisma, datasDoLancamento(l));
    // Soft delete: marca excluidoEm; some das listagens/relatórios (filtro global no prisma).
    await prisma.$transaction(async (tx) => {
      const r = await tx.lancamento.updateMany({ where: { id: i.id, excluidoEm: null }, data: { excluidoEm: new Date() } });
      if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
      await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: i.id, de: estado.status, para: "excluido", autorId: ctx.user.id } });
    });
    rev();
    return { id: i.id };
  },
);

/**
 * Corrigir conta, forma ou data de um lançamento JÁ pago, sem estornar (M8). Valor, categoria e projeto
 * continuam no formulário de edição. Regras em `corrigir-pagamento.ts`.
 */
export const corrigirPagamento = defineAction(
  { ...base, acao: "corrigir-pagamento", entidade: "Lancamento", schema: corrigirPagamentoSchema, capturarAntes: (i) => snapshotLancamento(i.id) },
  async (i) => {
    const r = await corrigirPagamentoNoBanco({ id: i.id, contaId: i.contaId, formaId: i.formaId || null, dataConfirmacao: i.dataConfirmacao });
    rev();
    revalidatePath("/financeiro/extrato");
    return { id: i.id, mudou: r.mudou };
  },
);
