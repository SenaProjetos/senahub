"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { confirmarDespesaProjetista } from "@/modules/financeiro/custo/lancamento-custo";
import { MSG_LOTE_SEM_VALOR, quandoDoPagamento, separarPagaveis } from "@/modules/financeiro/folha/service";
import { erroMoverLote, recalcularTotalFolha } from "./service";
import { contaPagamento, dataPagamento, formaPagamento } from "@/modules/financeiro/folha/schemas";

import { listarPagamentosDoLote, type PagamentoDoLote } from "./queries";

// Recorte fino da F4 (2026-09-02): era `permissao: "gerir"`, o mesmo interruptor de lançar
// boleto. Semeado para quem tinha `gerir`, então ninguém perdeu nada — passa a poder ser
// separado pela tela. Ver docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md.
const base = { modulo: "financeiro", recurso: "financeiro", permissao: "folha_pj" } as const;

/**
 * Pagamentos de um lote, pra expandir a linha na aba Lotes (F10/D29) — fora de `defineAction`
 * de propósito, mesmo padrão de `buscarEmpresaParaVincularAction` (comercial/actions.ts):
 * é busca, não mutação; gravar `AuditLog` a cada expandir/recolher poluiria a trilha sem
 * "o quê mudou" pra registrar. Ainda exige sessão + `folha_pj`, o mesmo piso da tela.
 *
 * `{ ok: false }` na falta de permissão, NUNCA `[]` — um lote com 3/3 pagos que devolvesse
 * `[]` renderizaria "este lote não tem pagamentos", uma mentira sobre dado financeiro que
 * ninguém veria como erro. Hoje é inalcançável (a página já exige `folha_pj`), e é
 * justamente por isso que precisa ficar certo agora — nada mais vai pegar esse caso.
 */
export async function pagamentosDoLote(
  folhaId: string,
): Promise<{ ok: true; itens: PagamentoDoLote[] } | { ok: false }> {
  const { requireUser } = await import("@/lib/session");
  const { can } = await import("@/lib/permissions");
  const user = await requireUser();
  if (!(await can(user, "financeiro", "folha_pj"))) return { ok: false };
  return { ok: true, itens: await listarPagamentosDoLote(folhaId) };
}

/**
 * Agrupa em um lote mensal os pagamentos de projetistas liberados no mês e ainda sem lote.
 * Idempotente: se o lote do mês já existe, anexa os novos e recalcula o total.
 */
export const gerarFolhaDoMes = defineAction(
  {
    ...base,
    acao: "gerar-folha-lote",
    entidade: "FolhaProjetista",
    schema: z.object({ ano: z.number().int().min(2000).max(2100), mes: z.number().int().min(1).max(12) }),
  },
  async ({ ano, mes }) => {
    const ini = new Date(ano, mes - 1, 1);
    const fim = new Date(ano, mes, 1);
    // `status: pendente` explícito: cancelar um pagamento o solta do lote (folhaId: null)
    // — sem este filtro ele seria recolhido de volta no lote seguinte.
    const pend = await prisma.pagamentoProjetista.findMany({
      where: { folhaId: null, status: "pendente", liberadoEm: { gte: ini, lt: fim } },
      select: { id: true },
    });
    // Mês sem pagamento fora de lote é o desfecho normal (mês corrente, mês já coberto por
    // outro lote) — não um erro. `ActionError` aqui virava toast vermelho num clique de rotina.
    if (pend.length === 0) {
      const existente = await prisma.folhaProjetista.findUnique({ where: { ano_mes: { ano, mes } } });
      return { id: existente?.id ?? null, vinculados: 0 };
    }

    const folha = await prisma.$transaction(async (tx) => {
      const existente = await tx.folhaProjetista.findUnique({ where: { ano_mes: { ano, mes } } });
      const f = existente ?? (await tx.folhaProjetista.create({ data: { ano, mes, status: "fechada", fechadaEm: new Date() } }));
      await tx.pagamentoProjetista.updateMany({ where: { id: { in: pend.map((p) => p.id) } }, data: { folhaId: f.id } });
      await recalcularTotalFolha(tx, f.id);
      // Mesmo `tx`: total, status e `fechadaEm` entram juntos. Lote que já existia mantém o
      // `fechadaEm` original — só um lote novo ganha a data de agora.
      return tx.folhaProjetista.update({
        where: { id: f.id },
        data: { status: "fechada", fechadaEm: existente?.fechadaEm ?? new Date() },
      });
    });
    revalidatePath("/financeiro/folha-projetistas");
    return { id: folha.id, vinculados: pend.length };
  },
);

/**
 * Paga um lote inteiro: confirma os lançamentos previstos de todos os pagamentos
 * pendentes do lote (conta/forma/data informados uma vez), marca-os como pagos e o
 * lote como 'paga'. Reutiliza a mesma lógica do pagamento individual (sem duplicar).
 */
export const pagarFolhaProjetista = defineAction(
  {
    ...base,
    acao: "pagar-folha-lote",
    entidade: "FolhaProjetista",
    schema: z.object({
      id: z.string().min(1),
      // F5 (N3): conta obrigatória, como no pagamento individual e no "Pagar selecionados".
      contaId: contaPagamento,
      formaId: formaPagamento,
      data: dataPagamento,
    }),
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (i, { user }) => {
    const folha = await prisma.folhaProjetista.findUnique({
      where: { id: i.id },
      include: {
        pagamentos: {
          // `pendente` explícito, não `!= pago`: um pagamento cancelado no lote não pode
          // ser pago junto (cancelar já o solta do lote, isto é a segunda trava).
          where: { status: "pendente" },
          include: {
            projetista: { select: { id: true, name: true } },
            disciplina: { select: { disciplinaTextoLegado: true, projetoId: true, projeto: { select: { codigo: true } } } },
          },
        },
      },
    });
    if (!folha) throw new ActionError("Lote não encontrado.");
    if (folha.pagamentos.length === 0) throw new ActionError("Nenhum pagamento pendente neste lote.");
    // Linha zerada fica pendente no lote: pagá-la criaria um lançamento confirmado de R$ 0,00.
    const { pagaveis, semValor } = separarPagaveis(folha.pagamentos);
    if (pagaveis.length === 0) throw new ActionError(MSG_LOTE_SEM_VALOR);

    const quando = quandoDoPagamento(i.data);

    const efetivados = await prisma.$transaction(async (tx) => {
      const feitos: typeof pagaveis = [];
      for (const pag of pagaveis) {
        // A leitura acima é de FORA da transação: "Pagar selecionados" ou o pagamento
        // individual podem ter pago a linha nesse meio-tempo. Sem reservar, ela seria
        // reconfirmada — sobrescrevendo conta e data do lançamento já pago.
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
        feitos.push(pag);
      }
      if (feitos.length === 0) throw new ActionError("Os pagamentos deste lote já foram efetivados — atualize a tela.");
      // Com linha zerada sobrando, o lote continua `fechada` — ainda há o que pagar nele.
      // Linha pulada pela reserva não conta: já está paga (por outro caminho).
      if (semValor.length === 0) {
        await tx.folhaProjetista.update({
          where: { id: folha.id },
          data: { status: "paga", pagaEm: quando },
        });
      }
      return feitos;
    }, { timeout: 30_000 });

    const projetistas = [...new Set(efetivados.map((p) => p.projetista.id))];
    await notificarMuitos(projetistas, {
      titulo: "Pagamento efetivado",
      corpo: `Seu pagamento da produção ${String(folha.mes).padStart(2, "0")}/${folha.ano} foi efetivado.`,
      href: "/financeiro",
      tag: `folha-paga-${folha.id}`,
    }, { categoria: "pagamento" });

    revalidatePath("/financeiro/folha-projetistas");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro/fluxo-caixa");
    return { id: folha.id, pagos: efetivados.length, semValor: semValor.length };
  },
);

/**
 * Exclui um lote (F12/D30, decisão N7): os pagamentos dele ficam SOLTOS (`folhaId: null`),
 * pagos inclusive. Nenhum pagamento e nenhum `Lancamento` é apagado ou alterado — só o
 * agrupamento some. Mesmo movimento que cancelar um pagamento já faz com o lote.
 *
 * Consequência que a tela diz na confirmação: gerar o mesmo mês de novo só recolhe
 * PENDENTES (`status: "pendente"` em `gerarFolhaDoMes`, carga do §5 do plano) — os pagos
 * soltos daqui não voltam para lote nenhum.
 */
export const excluirFolhaProjetista = defineAction(
  {
    ...base,
    // G2/D37: excluir lote desfaz agrupamento de dinheiro já pago — sai de `folha_pj` e entra
    // no gate de correção, junto com corrigir e estornar.
    permissao: "folha_pj_corrigir",
    acao: "excluir-folha-lote",
    entidade: "FolhaProjetista",
    schema: z.object({ id: z.string().min(1) }),
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    // O lote some da tabela: a auditoria passa a ser o único lugar que guarda o que ele era
    // e QUAIS pagamentos estavam dentro — o que permite remontar o agrupamento, se preciso.
    capturarAntes: (input) =>
      prisma.folhaProjetista.findUnique({
        where: { id: input.id },
        select: {
          ano: true,
          mes: true,
          status: true,
          total: true,
          fechadaEm: true,
          pagaEm: true,
          pagamentos: { select: { id: true, status: true, valor: true }, orderBy: { liberadoEm: "asc" } },
        },
      }),
  },
  async ({ id }) => {
    const soltos = await prisma.$transaction(async (tx) => {
      const folha = await tx.folhaProjetista.findUnique({ where: { id }, select: { id: true } });
      if (!folha) throw new ActionError("Lote não encontrado — atualize a tela.");
      // Explícito, não só o `onDelete: SetNull` do schema: a intenção fica no código e a
      // contagem volta para a mensagem da tela.
      const r = await tx.pagamentoProjetista.updateMany({ where: { folhaId: id }, data: { folhaId: null } });
      await tx.folhaProjetista.delete({ where: { id } });
      return r.count;
    });
    revalidatePath("/financeiro/folha-projetistas");
    return { id, soltos };
  },
);

/**
 * Lotes que podem receber um pagamento (G3/B5) — para o select do dialog de mover.
 * Fora de `defineAction` pelo mesmo motivo de `pagamentosDoLote`: é busca, não mutação.
 * Traz os `paga` junto, desabilitados na tela, para a pessoa entender por que aquele mês
 * não aparece como opção em vez de achar que sumiu.
 */
export async function lotesParaMover(): Promise<
  { ok: true; lotes: { id: string; ano: number; mes: number; status: string }[] } | { ok: false }
> {
  const { requireUser } = await import("@/lib/session");
  const { can } = await import("@/lib/permissions");
  const user = await requireUser();
  if (!(await can(user, "financeiro", "folha_pj"))) return { ok: false };
  const lotes = await prisma.folhaProjetista.findMany({
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    take: 24,
    select: { id: true, ano: true, mes: true, status: true },
  });
  return { ok: true, lotes };
}

const moverSchema = z.object({
  pagamentoId: z.string().min(1),
  /** Vazio = tirar do lote (o pagamento fica fora de lote, como um recém-liberado). */
  folhaId: z.string().optional(),
});

/**
 * Move um pagamento PENDENTE de lote (G3/B5, decisão N8) — ou o tira do lote.
 *
 * Gate `folha_pj` (e não `folha_pj_corrigir`): mover pendente é organizar agrupamento, não
 * desfazer pagamento. Quem pode gerar lote pode rearrumar o que ainda não foi pago.
 *
 * Recalcula o total dos DOIS lotes: `FolhaProjetista.total` é agregado gravado (D22), e
 * mover sem recalcular deixaria os dois números errados de uma vez.
 */
export const moverPagamentoDeLote = defineAction(
  {
    ...base,
    acao: "mover-pagamento-lote",
    entidade: "PagamentoProjetista",
    schema: moverSchema,
    entidadeId: (_d, i) => (i as { pagamentoId: string }).pagamentoId,
    capturarAntes: (i) =>
      prisma.pagamentoProjetista.findUnique({
        where: { id: i.pagamentoId },
        select: { status: true, folhaId: true, valor: true },
      }),
  },
  async (i) => {
    const destinoId = i.folhaId || null;

    const destino = await prisma.$transaction(async (tx) => {
      const pag = await tx.pagamentoProjetista.findUnique({
        where: { id: i.pagamentoId },
        select: { id: true, status: true, folhaId: true },
      });
      if (!pag) throw new ActionError("Pagamento não encontrado.");

      const alvo = destinoId
        ? await tx.folhaProjetista.findUnique({
            where: { id: destinoId },
            select: { id: true, status: true, ano: true, mes: true },
          })
        : null;
      if (destinoId && !alvo) throw new ActionError("Lote de destino não encontrado.");

      const bloqueio = erroMoverLote(pag.status, pag.folhaId, alvo);
      if (bloqueio) throw new ActionError(bloqueio);

      // `status` e `folhaId` na condição: se pagarem ou moverem a linha entre a leitura e
      // aqui, o update acha 0 e a transação inteira volta.
      const movido = await tx.pagamentoProjetista.updateMany({
        where: { id: pag.id, status: "pendente", folhaId: pag.folhaId },
        data: { folhaId: destinoId },
      });
      if (movido.count === 0) {
        throw new ActionError("O pagamento mudou enquanto a tela estava aberta — atualize e tente de novo.");
      }

      if (pag.folhaId) await recalcularTotalFolha(tx, pag.folhaId);
      if (destinoId) await recalcularTotalFolha(tx, destinoId);
      return alvo;
    });

    revalidatePath("/financeiro/folha-projetistas");
    return {
      id: i.pagamentoId,
      destino: destino ? `${String(destino.mes).padStart(2, "0")}/${destino.ano}` : null,
    };
  },
);
