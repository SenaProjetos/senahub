"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificar, notificarMuitos } from "@/lib/notificar";
import { confirmarDespesaProjetista, criarDespesaProjetistaPrevista } from "@/modules/financeiro/custo/lancamento-custo";
import { sincronizarValorDisciplina } from "@/modules/uploads/pagamento";
import { recalcularTotalFolha } from "@/modules/financeiro/folha-lote/service";
import type { Prisma } from "@/generated/prisma/client";
import {
  MSG_PAGAMENTO_SEM_VALOR,
  erroTransicao,
  erroCorrecaoEfetivado,
  erroCorrecaoConciliada,
  erroEstornoEfetivado,
  quandoDoPagamento,
  separarPagaveis,
  temValorPagavel,
} from "@/modules/financeiro/folha/service";
import { contaPagamento, dataPagamento, formaPagamento } from "@/modules/financeiro/folha/schemas";

const pagarSchema = z.object({
  id: z.string().min(1),
  // F5 (N3): conta obrigatória — antes opcional, o que deixava lançamento confirmado sem conta.
  contaId: contaPagamento,
  formaId: formaPagamento,
  data: dataPagamento,
});

/**
 * Efetiva o pagamento ao projetista: marca pago e CONFIRMA o lançamento de despesa
 * previsto criado na validação da entrega → entra no caixa e na DRE. Se (por dado
 * legado) não houver lançamento previsto, cria um já confirmado. Sem duplicação.
 */
export const pagarProjetista = defineAction(
  {
    modulo: "financeiro",
    acao: "pagar-projetista",
    recurso: "financeiro",
    // F4: `folha_pj` no lugar de `gerir` — ver conciliacao/actions.ts.
    permissao: "folha_pj",
    entidade: "PagamentoProjetista",
    schema: pagarSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (i, { user }) => {
    const pag = await prisma.pagamentoProjetista.findUnique({
      where: { id: i.id },
      include: {
        projetista: { select: { id: true, name: true } },
        disciplina: { select: { disciplinaTextoLegado: true, projetoId: true, projeto: { select: { codigo: true } } } },
      },
    });
    if (!pag) throw new ActionError("Pagamento não encontrado.");
    const bloqueio = erroTransicao("pagar", pag.status);
    if (bloqueio) throw new ActionError(bloqueio);
    if (!temValorPagavel(pag.valor)) throw new ActionError(MSG_PAGAMENTO_SEM_VALOR);

    const quando = quandoDoPagamento(i.data);

    const lancamentoId = await prisma.$transaction(async (tx) => {
      // Reserva antes de gerar o lançamento (mesmo padrão de `pagarProjetistasSelecionados`):
      // outro caminho que pagou esta linha entre a leitura e aqui deixa 0 linhas e aborta.
      const reserva = await tx.pagamentoProjetista.updateMany({
        where: { id: pag.id, status: "pendente" },
        data: { status: "pago", pagoEm: quando },
      });
      if (reserva.count === 0) throw new ActionError("Pagamento já efetivado ou cancelado — atualize a tela.");

      const lancamentoId = await confirmarDespesaProjetista(
        tx,
        {
          id: pag.id,
          lancamentoId: pag.lancamentoId,
          valor: pag.valor,
          tipoProfissional: pag.tipoProfissional,
          projetistaNome: pag.projetista.name,
          disciplinaNome: pag.disciplina.disciplinaTextoLegado,
          projetoId: pag.disciplina.projetoId,
          projetoCodigo: pag.disciplina.projeto.codigo,
        },
        { contaId: i.contaId, formaId: i.formaId || null, quando, autorId: user.id },
      );
      await tx.pagamentoProjetista.update({ where: { id: pag.id }, data: { lancamentoId } });
      return lancamentoId;
    });

    await notificar(pag.projetista.id, {
      titulo: "Pagamento efetivado",
      corpo: `Seu pagamento de ${pag.disciplina.disciplinaTextoLegado} foi efetivado.`,
      href: "/financeiro",
      tag: `pago-${pag.id}`,
    }, { categoria: "pagamento" });

    revalidatePath("/financeiro/folha-projetistas");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro/fluxo-caixa");
    // `lancamentoId` sai daqui pro dialog oferecer "anexar comprovante" (F8/D26) sem 2ª
    // busca — o pagamento individual sempre tem exatamente um lançamento nesse ponto.
    return { id: pag.id, lancamentoId };
  },
);

const anexarComprovanteSchema = z.object({
  lancamentoId: z.string().min(1),
  meta: z.object({
    caminho: z.string().min(1),
    nome: z.string().min(1),
    mime: z.string().min(1),
    tamanho: z.number().int().nonnegative(),
  }),
});

/**
 * Anexa o comprovante ao lançamento de um pagamento de produção (F8/D26). Escopo estreito
 * de propósito (decisão do dono, opção A): mesma tabela e mesma mecânica de
 * `adicionarAnexoLancamento` (`lancamentos/actions.ts`), mas gated `folha_pj` — não
 * `financeiro:gerir`, que abriria anexo em QUALQUER lançamento do sistema pra quem só tem
 * acesso à Produção (o mesmo recorte que a F4 fez de propósito, 2026-09-02). A guarda real
 * é o `pagamentoProjetistaId` checado abaixo: `folha_pj` só anexa em lançamento que veio de
 * um pagamento de projetista, mesmo que alguém tente passar o id de outro lançamento.
 */
export const anexarComprovantePagamento = defineAction(
  {
    modulo: "financeiro",
    acao: "anexar-comprovante-pagamento",
    recurso: "financeiro",
    permissao: "folha_pj",
    entidade: "LancamentoAnexo",
    schema: anexarComprovanteSchema,
  },
  async (i, { user }) => {
    const lanc = await prisma.lancamento.findUnique({
      where: { id: i.lancamentoId },
      select: { pagamentoProjetistaId: true },
    });
    if (!lanc) throw new ActionError("Lançamento não encontrado.");
    if (!lanc.pagamentoProjetistaId) {
      throw new ActionError("Este lançamento não é de um pagamento de produção.");
    }
    const a = await prisma.lancamentoAnexo.create({
      data: {
        lancamentoId: i.lancamentoId,
        caminho: i.meta.caminho,
        nome: i.meta.nome,
        mime: i.meta.mime,
        tamanho: i.meta.tamanho,
        autorId: user.id,
      },
    });
    revalidatePath("/financeiro/folha-projetistas");
    revalidatePath("/financeiro/lancamentos");
    return { id: a.id };
  },
);

// Remoção de comprovante fica de fora deste corte (F8/D26): o pedido era anexar no ato do
// pagamento. Gerenciar/remover o que já foi anexado é o caminho de sempre — abrir o
// lançamento em Lançamentos (`financeiro:gerir`), que já tem essa UI.

const editarValorSchema = z.object({
  id: z.string().min(1),
  valor: z.number().positive("Informe um valor maior que zero."),
  // Ausente = não mexe; string vazia = apaga a observação.
  observacao: z.string().trim().max(500, "Observação com no máximo 500 caracteres.").optional(),
});

/**
 * Corrige o valor de um pagamento PENDENTE direto na folha — a rota de conserto para as
 * linhas de R$ 0,00 que já existem em produção (disciplinas concluídas sem valor antes do
 * gate de aprovação existir). Sincroniza o lançamento previsto (cria quando falta, como
 * nessas linhas) e o total do lote, se houver. Também grava a `observacao` do pagamento
 * (F2 — o campo existia no schema e nenhuma tela o lia ou escrevia).
 *
 * Zerar não é uma opção aqui — valor > 0 é exigido pelo schema; para zerar, cancele.
 */
export const editarPagamentoProjetista = defineAction(
  {
    modulo: "financeiro",
    acao: "editar-pagamento-projetista",
    recurso: "financeiro",
    // F4: `folha_pj` no lugar de `gerir` — ver conciliacao/actions.ts.
    permissao: "folha_pj",
    entidade: "PagamentoProjetista",
    schema: editarValorSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    capturarAntes: (input) =>
      prisma.pagamentoProjetista.findUnique({
        where: { id: input.id },
        select: { valor: true, status: true, observacao: true },
      }),
  },
  async (input, { user }) => {
    const pag = await prisma.pagamentoProjetista.findUnique({
      where: { id: input.id },
      include: {
        projetista: { select: { name: true, role: true } },
        disciplina: { select: { disciplinaTextoLegado: true, projetoId: true, projeto: { select: { codigo: true } } } },
      },
    });
    if (!pag) throw new ActionError("Pagamento não encontrado.");
    const bloqueio = erroTransicao("editar", pag.status);
    if (bloqueio) throw new ActionError(bloqueio);

    await prisma.$transaction(async (tx) => {
      await tx.pagamentoProjetista.update({
        where: { id: pag.id },
        data: {
          valor: input.valor,
          ...(input.observacao !== undefined ? { observacao: input.observacao || null } : {}),
        },
      });

      if (pag.lancamentoId) {
        await tx.lancamento.updateMany({
          where: { id: pag.lancamentoId, status: { not: "cancelado" } },
          data: { valor: input.valor },
        });
      } else {
        // Linhas de R$ 0,00 nunca ganharam lançamento (a criação exige valor > 0).
        const lancamentoId = await criarDespesaProjetistaPrevista(tx, {
          pagamentoId: pag.id,
          valor: input.valor,
          tipoProfissional: pag.tipoProfissional,
          projetistaNome: pag.projetista.name,
          disciplinaNome: pag.disciplina.disciplinaTextoLegado,
          projetoId: pag.disciplina.projetoId,
          projetoCodigo: pag.disciplina.projeto.codigo,
          autorId: user.id,
          quando: new Date(),
        });
        await tx.pagamentoProjetista.update({ where: { id: pag.id }, data: { lancamentoId } });
      }

      if (pag.folhaId) await recalcularTotalFolha(tx, pag.folhaId);
      // Sem isto, a próxima vez que alguém mexer em valor/responsáveis desta disciplina,
      // o rateio parte do Disciplina.valor antigo e desfaz este ajuste em silêncio.
      await sincronizarValorDisciplina(tx, pag.disciplinaId);
    });

    revalidatePath("/financeiro/folha-projetistas");
    revalidatePath("/financeiro/lancamentos");
    return { id: pag.id };
  },
);

const corrigirEfetivadoSchema = z.object({
  id: z.string().min(1),
  valor: z.number().positive("Informe um valor maior que zero."),
  contaId: contaPagamento,
  formaId: formaPagamento,
  // Obrigatória aqui (no pagar, vazio = hoje): a correção sempre parte da data já gravada.
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do pagamento."),
  observacao: z.string().trim().max(500, "Observação com no máximo 500 caracteres.").optional(),
  justificativa: z
    .string()
    .trim()
    .min(10, "Explique o motivo da correção (mínimo 10 caracteres).")
    .max(500, "Justificativa com no máximo 500 caracteres."),
});

/**
 * Lançamento de um pagamento: pelo `lancamentoId` do pagamento e, sem ele, pelo
 * `pagamentoProjetistaId` do lançamento — mesma precedência de `comLancamentos` e de
 * `confirmarDespesaProjetista` (não há FK entre as tabelas, só as duas colunas soltas).
 * `excluidoEm: null` explícito: o filtro automático de soft delete não cobre toda leitura.
 */
async function lancamentoDoPagamento(db: Prisma.TransactionClient, pag: { id: string; lancamentoId: string | null }) {
  const select = {
    id: true,
    status: true,
    valor: true,
    valorEfetivo: true,
    contaId: true,
    formaId: true,
    dataConfirmacao: true,
    // G1a: valor/conta/data do extrato — a correção de uma linha conciliada tem de bater
    // com a transação, e é dela que sai a `dataConfirmacao` nesse caso.
    transacao: { select: { id: true, valor: true, contaId: true, data: true } },
  } satisfies Prisma.LancamentoSelect;
  const porId = pag.lancamentoId
    ? await db.lancamento.findFirst({ where: { id: pag.lancamentoId, excluidoEm: null }, select })
    : null;
  return porId ?? db.lancamento.findFirst({ where: { pagamentoProjetistaId: pag.id, excluidoEm: null }, select });
}

/**
 * Corrige um pagamento JÁ efetivado (F11/D27, decisão N6): valor, conta, forma, data e
 * observação, com justificativa obrigatória — que vai para o `AuditLog` junto com o input
 * (`detalhe.novo`), ao lado do estado anterior dos DOIS lados (`capturarAntes`).
 *
 * Regra em `erroCorrecaoEfetivado`: só `pago`, com lançamento confirmado, sem baixa parcial
 * e nunca conciliado com o extrato. `editarPagamentoProjetista` segue só para pendentes —
 * esta é outra porta, não um afrouxamento daquela.
 *
 * Mantém as mesmas cargas estruturais da edição de pendente (§5 do plano): total do lote e
 * `sincronizarValorDisciplina` — "pool = soma dos vivos" inclui os pagos.
 */
export const corrigirPagamentoEfetivado = defineAction(
  {
    modulo: "financeiro",
    acao: "corrigir-pagamento-efetivado",
    recurso: "financeiro",
    // G2/D37: desfazer o que já foi pago é outro poder que pagar. Semeado para quem tinha
    // `folha_pj` (migration 20260912120000), então ninguém perdeu acesso ao separar.
    permissao: "folha_pj_corrigir",
    entidade: "PagamentoProjetista",
    schema: corrigirEfetivadoSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    // Os dois lados: "qual era a conta/data antes desta correção" é a pergunta que a
    // justificativa existe para responder — e conta/data moram no lançamento, não no pagamento.
    capturarAntes: async (input) => {
      const pagamento = await prisma.pagamentoProjetista.findUnique({
        where: { id: input.id },
        select: { id: true, valor: true, status: true, pagoEm: true, observacao: true, lancamentoId: true },
      });
      if (!pagamento) return null;
      const l = await lancamentoDoPagamento(prisma, pagamento);
      return {
        pagamento,
        lancamento: l && { id: l.id, valor: l.valor, contaId: l.contaId, formaId: l.formaId, dataConfirmacao: l.dataConfirmacao },
      };
    },
  },
  async (i) => {
    const pag = await prisma.pagamentoProjetista.findUnique({
      where: { id: i.id },
      select: { id: true, status: true, lancamentoId: true, folhaId: true, disciplinaId: true },
    });
    if (!pag) throw new ActionError("Pagamento não encontrado.");
    const quando = quandoDoPagamento(i.data);

    await prisma.$transaction(async (tx) => {
      const lanc = await lancamentoDoPagamento(tx, pag);
      const bloqueio = erroCorrecaoEfetivado(
        pag.status,
        lanc && { status: lanc.status, conciliado: lanc.transacao != null, parcial: lanc.valorEfetivo != null },
      );
      if (bloqueio || !lanc) throw new ActionError(bloqueio ?? "Lançamento não encontrado.");

      // Id inválido viraria erro genérico de FK — diz qual campo.
      const conta = await tx.contaBancaria.findUnique({ where: { id: i.contaId }, select: { id: true } });
      if (!conta) throw new ActionError("Conta não encontrada.");
      if (i.formaId) {
        const forma = await tx.formaPagamento.findUnique({ where: { id: i.formaId }, select: { id: true } });
        if (!forma) throw new ActionError("Forma de pagamento não encontrada.");
      }

      // G1a/D31: conciliado deixou de ser bloqueio — mas o extrato manda. A correção só
      // passa se o resultado bater com a transação conciliada, e a data do pagamento passa
      // a ser a do extrato (o banco já disse quando o dinheiro saiu; a tela não discute).
      const conciliada = lanc.transacao;
      if (conciliada) {
        const erro = erroCorrecaoConciliada(
          { valor: Number(conciliada.valor), contaId: conciliada.contaId },
          { valor: i.valor, contaId: i.contaId },
        );
        if (erro) throw new ActionError(erro);
      }
      const quandoFinal = conciliada ? conciliada.data : quando;

      const reserva = await tx.pagamentoProjetista.updateMany({
        where: { id: pag.id, status: "pago" },
        data: {
          valor: i.valor,
          pagoEm: quandoFinal,
          ...(i.observacao !== undefined ? { observacao: i.observacao || null } : {}),
        },
      });
      if (reserva.count === 0) {
        throw new ActionError("O pagamento mudou enquanto a tela estava aberta — atualize e tente de novo.");
      }

      // As mesmas guardas repetidas NA ESCRITA (não só na leitura acima): o vínculo com o
      // extrato tem de estar do jeito que estava quando a regra acima decidiu. Livre
      // continua livre (`transacao: { is: null }`); conciliada continua conciliada NA MESMA
      // transação (`is: { id }`) — se alguém conciliar, desconciliar ou reconciliar com
      // outra no meio, o update acha 0 linhas e a transação inteira volta.
      // `data` (competência) fica como está — `confirmarDespesaProjetista` também a preserva
      // ao confirmar um previsto; o que muda com o pagamento é `dataConfirmacao`.
      const atualizado = await tx.lancamento.updateMany({
        where: {
          id: lanc.id,
          status: "confirmado",
          excluidoEm: null,
          valorEfetivo: null,
          transacao: conciliada ? { is: { id: conciliada.id } } : { is: null },
        },
        data: { valor: i.valor, contaId: i.contaId, formaId: i.formaId || null, dataConfirmacao: quandoFinal },
      });
      if (atualizado.count === 0) {
        throw new ActionError("O lançamento mudou enquanto a tela estava aberta (conciliação ou edição em Lançamentos) — atualize e tente de novo.");
      }

      if (pag.folhaId) await recalcularTotalFolha(tx, pag.folhaId);
      await sincronizarValorDisciplina(tx, pag.disciplinaId);
    });

    revalidatePath("/financeiro/folha-projetistas");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro/fluxo-caixa");
    return { id: pag.id };
  },
);

const estornarSchema = z.object({
  id: z.string().min(1),
  justificativa: z
    .string()
    .trim()
    .min(10, "Explique o motivo do estorno (mínimo 10 caracteres).")
    .max(500, "Justificativa com no máximo 500 caracteres."),
});

/**
 * Estorna um pagamento JÁ efetivado (G1b/D31): vira `cancelado`, o lançamento do caixa é
 * cancelado e a linha sai do lote. É a porta que a N6 supôs existir — até aqui, um
 * pagamento pago por engano não tinha saída nenhuma pela tela de Produção, e a única
 * válvula era cancelar o lançamento por Lançamentos, que deixava o pagamento `pago`
 * apontando para lançamento cancelado. Essa válvula fechou na mesma entrega
 * (`cancelarLancamento` agora recusa lançamento de produção).
 *
 * Conciliado não estorna (`erroEstornoEfetivado`): o dinheiro saiu de verdade, e o extrato
 * registra isso — o certo é lançar a devolução quando ela entrar.
 *
 * `pagoEm` fica gravado de propósito: o pagamento ACONTECEU e depois foi desfeito; apagar a
 * data reescreveria a história. Quem lê a linha vê `cancelado`, e a auditoria tem o antes.
 */
export const estornarPagamentoEfetivado = defineAction(
  {
    modulo: "financeiro",
    acao: "estornar-pagamento-efetivado",
    recurso: "financeiro",
    // G2/D37: mesmo gate da correção — as duas desfazem pagamento já efetivado.
    permissao: "folha_pj_corrigir",
    entidade: "PagamentoProjetista",
    schema: estornarSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    capturarAntes: async (input) => {
      const pagamento = await prisma.pagamentoProjetista.findUnique({
        where: { id: input.id },
        select: { id: true, valor: true, status: true, pagoEm: true, folhaId: true, lancamentoId: true },
      });
      if (!pagamento) return null;
      const l = await lancamentoDoPagamento(prisma, pagamento);
      return {
        pagamento,
        lancamento: l && { id: l.id, valor: l.valor, status: l.status, contaId: l.contaId, dataConfirmacao: l.dataConfirmacao },
      };
    },
  },
  async (i, { user }) => {
    const pag = await prisma.pagamentoProjetista.findUnique({
      where: { id: i.id },
      select: { id: true, status: true, lancamentoId: true, folhaId: true, disciplinaId: true },
    });
    if (!pag) throw new ActionError("Pagamento não encontrado.");

    await prisma.$transaction(async (tx) => {
      const lanc = await lancamentoDoPagamento(tx, pag);
      const bloqueio = erroEstornoEfetivado(
        pag.status,
        lanc && { status: lanc.status, conciliado: lanc.transacao != null, parcial: lanc.valorEfetivo != null },
      );
      if (bloqueio) throw new ActionError(bloqueio);

      // `folhaId: null` junto: mesma trava do cancelamento de pendente (§5 do plano) — um
      // cancelado preso ao lote seria recolhido e pago de novo no "Pagar lote".
      const reserva = await tx.pagamentoProjetista.updateMany({
        where: { id: pag.id, status: "pago" },
        data: { status: "cancelado", folhaId: null },
      });
      if (reserva.count === 0) {
        throw new ActionError("O pagamento mudou enquanto a tela estava aberta — atualize e tente de novo.");
      }

      // Lançamento já cancelado (o estado inconsistente que esta ação existe para limpar)
      // não precisa de update — só não pode ser tocado de novo.
      if (lanc && lanc.status !== "cancelado") {
        // `transacao: { is: null }` NA ESCRITA: se conciliarem entre a leitura e aqui, o
        // update acha 0 linhas e tudo volta, em vez de apagar do caixa uma saída que o
        // banco já registrou.
        const cancelado = await tx.lancamento.updateMany({
          where: { id: lanc.id, status: { not: "cancelado" }, excluidoEm: null, transacao: { is: null } },
          data: { status: "cancelado" },
        });
        if (cancelado.count === 0) {
          throw new ActionError("O lançamento mudou enquanto a tela estava aberta (conciliação ou edição em Lançamentos) — atualize e tente de novo.");
        }
        // Mesmo rastro que `cancelarLancamento` deixa na tela de Lançamentos.
        await tx.lancamentoStatusHistorico.create({
          data: { lancamentoId: lanc.id, de: lanc.status, para: "cancelado", autorId: user.id },
        });
      }

      if (pag.folhaId) await recalcularTotalFolha(tx, pag.folhaId);
      await sincronizarValorDisciplina(tx, pag.disciplinaId);
    });

    revalidatePath("/financeiro/folha-projetistas");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro/fluxo-caixa");
    return { id: pag.id };
  },
);

const cancelarSchema = z.object({ id: z.string().min(1) });

/**
 * Cancela um pagamento PENDENTE direto na folha — a linha some do "a pagar" sem virar
 * dívida fantasma. Solta do lote (`folhaId: null`; ver P.S. em `pagarFolhaProjetista`
 * sobre por que um cancelado não pode ficar preso a um lote) e cancela o lançamento
 * previsto vinculado, se houver.
 */
export const cancelarPagamentoProjetista = defineAction(
  {
    modulo: "financeiro",
    acao: "cancelar-pagamento-projetista",
    recurso: "financeiro",
    // F4: `folha_pj` no lugar de `gerir` — ver conciliacao/actions.ts.
    permissao: "folha_pj",
    entidade: "PagamentoProjetista",
    schema: cancelarSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    capturarAntes: (input) =>
      prisma.pagamentoProjetista.findUnique({
        where: { id: input.id },
        select: { valor: true, status: true, folhaId: true },
      }),
  },
  async (input) => {
    const pag = await prisma.pagamentoProjetista.findUnique({ where: { id: input.id } });
    if (!pag) throw new ActionError("Pagamento não encontrado.");
    const bloqueio = erroTransicao("cancelar", pag.status);
    if (bloqueio) throw new ActionError(bloqueio);

    await prisma.$transaction(async (tx) => {
      await tx.pagamentoProjetista.update({
        where: { id: pag.id },
        data: { status: "cancelado", folhaId: null },
      });
      if (pag.lancamentoId) {
        await tx.lancamento.updateMany({
          where: { id: pag.lancamentoId, status: { not: "cancelado" } },
          data: { status: "cancelado" },
        });
      }
      if (pag.folhaId) await recalcularTotalFolha(tx, pag.folhaId);
      await sincronizarValorDisciplina(tx, pag.disciplinaId);
    });

    revalidatePath("/financeiro/folha-projetistas");
    revalidatePath("/financeiro/lancamentos");
    return { id: pag.id };
  },
);

const pagarSelecionadosSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Selecione ao menos um pagamento.").max(200),
  // Conta obrigatória desde a criação (decisão N3) — mesmo campo das outras duas (F5).
  contaId: contaPagamento,
  formaId: formaPagamento,
  data: dataPagamento,
});

/**
 * Efetiva vários pagamentos pendentes de uma vez ("Pagar selecionados" na tela Produção).
 *
 * Os ids vêm de uma tela renderizada antes do clique — por isso tudo é RELIDO dentro da
 * transação: só entra o que ainda está `pendente` e com valor (a guarda de R$ 0,00 da F0a
 * não pode ganhar uma porta lateral). Cada linha é reservada com
 * `updateMany where status=pendente` ANTES de gerar o lançamento: um segundo envio
 * concorrente espera o lock, encontra 0 linhas e pula, em vez de pagar de novo.
 *
 * Uma notificação por projetista, não por pagamento (quem teve 12 entregas pagas recebe 1).
 */
export const pagarProjetistasSelecionados = defineAction(
  {
    modulo: "financeiro",
    acao: "pagar-projetistas-selecionados",
    recurso: "financeiro",
    permissao: "folha_pj",
    entidade: "PagamentoProjetista",
    schema: pagarSelecionadosSchema,
  },
  async (i, { user }) => {
    const quando = quandoDoPagamento(i.data);

    const pagos = await prisma.$transaction(
      async (tx) => {
        const pendentes = await tx.pagamentoProjetista.findMany({
          where: { id: { in: i.ids }, status: "pendente" },
          include: {
            projetista: { select: { id: true, name: true } },
            disciplina: { select: { disciplinaTextoLegado: true, projetoId: true, projeto: { select: { codigo: true } } } },
          },
        });
        const { pagaveis } = separarPagaveis(pendentes);

        const efetivados: typeof pagaveis = [];
        for (const pag of pagaveis) {
          const reserva = await tx.pagamentoProjetista.updateMany({
            where: { id: pag.id, status: "pendente" },
            data: { status: "pago", pagoEm: quando },
          });
          if (reserva.count === 0) continue;

          const lancamentoId = await confirmarDespesaProjetista(
            tx,
            {
              id: pag.id,
              lancamentoId: pag.lancamentoId,
              valor: pag.valor,
              tipoProfissional: pag.tipoProfissional,
              projetistaNome: pag.projetista.name,
              disciplinaNome: pag.disciplina.disciplinaTextoLegado,
              projetoId: pag.disciplina.projetoId,
              projetoCodigo: pag.disciplina.projeto.codigo,
            },
            { contaId: i.contaId, formaId: i.formaId || null, quando, autorId: user.id },
          );
          await tx.pagamentoProjetista.update({ where: { id: pag.id }, data: { lancamentoId } });
          efetivados.push(pag);
        }
        return efetivados;
      },
      // Até 200 linhas, cada uma com 3-4 escritas: o padrão de 5 s do Prisma é curto.
      { timeout: 30_000 },
    );

    if (pagos.length === 0) {
      throw new ActionError("Nenhum dos selecionados pode ser pago — já foram pagos, cancelados ou estão sem valor.");
    }

    const projetistas = [...new Set(pagos.map((p) => p.projetista.id))];
    await notificarMuitos(projetistas, {
      titulo: "Pagamento efetivado",
      corpo: "Pagamento de produção efetivado — confira no seu extrato.",
      href: "/financeiro",
      tag: `pagos-selecionados-${quando.toISOString().slice(0, 10)}`,
    }, { categoria: "pagamento" });

    revalidatePath("/financeiro/folha-projetistas");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro/fluxo-caixa");
    return {
      pagos: pagos.length,
      ignorados: i.ids.length - pagos.length,
      total: pagos.reduce((s, p) => s + Number(p.valor), 0),
    };
  },
);
