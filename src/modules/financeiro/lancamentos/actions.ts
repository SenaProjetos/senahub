"use server";

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
import { camposDoPlanejador, saldoRestante } from "@/modules/financeiro/lancamentos/parcial";
import { getExclusaoCompleto } from "@/modules/financeiro/config/queries";
import { verificarSenha } from "@/modules/financeiro/config/senha";

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

/**
 * Lançamento gerado pela taxa de uma ART: cancelar ou excluir por aqui deixaria a ART apontando
 * para um lançamento morto, e a próxima edição da ART o recriaria. A porta certa é a aba ARTs
 * do projeto (mudar custeio/situação ou excluir a ART). Baixar segue liberado.
 */
async function barrarSeLancamentoDeArt(id: string) {
  const art = await prisma.art.findFirst({
    where: { OR: [{ lancamentoId: id }, { reembolsoLancamentoId: id }] },
    select: { tipo: true, numero: true },
  });
  if (art) {
    throw new ActionError(
      `Este lançamento é da taxa da ${art.tipo} ${art.numero} — altere pela aba ARTs do projeto.`,
    );
  }
}

/** Snapshot JSON-safe do lançamento p/ auditoria valor-anterior × novo. */
async function snapshotLancamento(id: string) {
  const l = await prisma.lancamento.findUnique({
    where: { id },
    select: {
      valor: true, valorEfetivo: true, status: true, descricao: true, vencimento: true,
      categoriaId: true, centroId: true, projetoId: true, fornecedorId: true, clienteId: true, observacao: true,
      // Campos do planejador: sem eles a auditoria não vê a troca de prioridade/confiança.
      prioridade: true, confianca: true, transferenciaId: true, caixinhaId: true,
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

/**
 * F7.2: a previsão do cronograma (`previsao`) é da sincronização do contrato por entrega — editar,
 * receber, cancelar ou excluir por aqui seria desfeito na próxima mudança do marco, ou receberia
 * dinheiro de uma parcela que ninguém faturou. A porta é faturar a parcela no contrato.
 */
const MOTIVO_PREVISAO =
  "É uma previsão do cronograma (contrato por entrega): ela anda com o marco e vira cobrança quando a parcela é faturada no contrato.";

async function barrarSePrevisao(id: string) {
  const l = await prisma.lancamento.findUnique({ where: { id }, select: { status: true } });
  if (l?.status === "previsao") throw new ActionError(MOTIVO_PREVISAO);
}

export const editarLancamento = defineAction(
  { ...base, acao: "editar-lancamento", entidade: "Lancamento", schema: editarLancamentoSchema, capturarAntes: (i) => snapshotLancamento(i.id) },
  async (i) => {
    await barrarSePrevisao(i.id);
    const atual = await prisma.lancamento.findUnique({ where: { id: i.id }, select: { tipo: true, status: true } });
    if (!atual) throw new ActionError("Lançamento não encontrado.");
    if (i.caixinhaId !== undefined) await validarCaixinhaDoLancamento(atual, i.caixinhaId);
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
      },
    });
    rev();
    return { id: i.id };
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
    const lanc = await prisma.lancamento.findUnique({ where: { id: i.id } });
    if (!lanc) throw new ActionError("Lançamento não encontrado.");
    if (lanc.status === "confirmado") throw new ActionError("Já confirmado.");
    if (lanc.status === "aguardando_aprovacao") throw new ActionError("Despesa aguardando aprovação.");
    if (lanc.status === "previsao") throw new ActionError(MOTIVO_PREVISAO);

    // Valor pago: usa o efetivo informado; se < total, o saldo vira um novo lançamento previsto.
    const restante = saldoRestante(Number(lanc.valor), i.valorEfetivo);
    const quando = data(i.dataConfirmacao || undefined) ?? new Date();

    const ops = [
      prisma.lancamento.update({
        where: { id: i.id },
        data: {
          status: "confirmado" as const,
          dataConfirmacao: quando,
          contaId: i.contaId || lanc.contaId,
          formaId: i.formaId || lanc.formaId,
          valorEfetivo: i.valorEfetivo ?? null,
          statusHistorico: { create: { de: lanc.status, para: "confirmado", autorId: ctx.user.id } },
        },
      }),
    ];

    if (restante != null) {
      ops.push(
        prisma.lancamento.create({
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
            autorId: ctx.user.id,
          },
        }) as (typeof ops)[number],
      );
    }

    await prisma.$transaction(ops);
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
    const quando = data(i.dataConfirmacao || undefined) ?? new Date();
    const alvos = await prisma.lancamento.findMany({
      where: { id: { in: i.ids }, status: "previsto" },
      select: { id: true, contaId: true, formaId: true },
    });
    if (alvos.length === 0) throw new ActionError("Nenhum lançamento elegível (previsto) selecionado.");

    await prisma.$transaction(
      alvos.map((l) =>
        prisma.lancamento.update({
          where: { id: l.id },
          data: {
            status: "confirmado",
            dataConfirmacao: quando,
            contaId: i.contaId || l.contaId,
            formaId: i.formaId || l.formaId,
            statusHistorico: { create: { de: "previsto", para: "confirmado", autorId: ctx.user.id } },
          },
        }),
      ),
    );
    rev();
    return { confirmados: alvos.length, ignorados: i.ids.length - alvos.length };
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
    const atual = await prisma.lancamento.findUnique({
      where: { id: i.id },
      select: { status: true, pagamentoProjetistaId: true },
    });
    // G1b/D31: mesma guarda que `excluirLancamento` já tinha. Cancelar por aqui o lançamento
    // de um pagamento de produção deixava o pagamento `pago` apontando para lançamento
    // cancelado — estado que a própria correção (F11) depois recusa. A Produção tem as duas
    // portas certas: corrigir (F11) e estornar (G1b).
    if (atual?.pagamentoProjetistaId) {
      throw new ActionError(
        "Este lançamento é de um pagamento de produção — corrija ou estorne pela tela de Produção.",
      );
    }
    await barrarSeLancamentoDeArt(i.id);
    if (atual?.status === "previsao") throw new ActionError(MOTIVO_PREVISAO);
    await prisma.lancamento.update({
      where: { id: i.id },
      data: {
        status: "cancelado",
        statusHistorico: { create: { de: atual?.status ?? null, para: "cancelado", autorId: ctx.user.id } },
      },
    });
    rev();
    return { id: i.id };
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
  async (i) => {
    const exclusao = await getExclusaoCompleto();
    if (exclusao.exigir && !verificarSenha(i.senha ?? "", exclusao.hash)) {
      throw new ActionError("Senha de exclusão incorreta.");
    }
    const lanc = await prisma.lancamento.findUnique({ where: { id: i.id } });
    if (!lanc) throw new ActionError("Lançamento não encontrado.");
    if (lanc.pagamentoProjetistaId) {
      throw new ActionError("Lançamento de folha não pode ser excluído aqui.");
    }
    if (lanc.status === "previsao") throw new ActionError(MOTIVO_PREVISAO);
    await barrarSeLancamentoDeArt(i.id);
    // Soft delete: marca excluidoEm; some das listagens/relatórios (filtro global no prisma).
    await prisma.lancamento.update({ where: { id: i.id }, data: { excluidoEm: new Date() } });
    rev();
    return { id: i.id };
  },
);
