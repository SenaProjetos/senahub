"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { contasEmAberto } from "@/modules/financeiro/planejamento/queries";
import { saldoRestante } from "@/modules/financeiro/lancamentos/parcial";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;

function rev(id?: string) {
  revalidatePath("/financeiro/planejamento");
  if (id) revalidatePath(`/financeiro/planejamento/${id}`);
}
function data(s?: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

/** Cria o cenário e carrega automaticamente as contas em aberto do período/filtros como linhas. */
export const criarPlano = defineAction(
  {
    ...base,
    acao: "criar-plano-pagamento",
    entidade: "PlanejamentoPagamento",
    schema: z.object({
      nome: z.string().min(1, "Informe o nome do cenário."),
      saldoDisponivel: z.number().min(0),
      periodoIni: opt(z.string()),
      periodoFim: opt(z.string()),
      contaId: opt(z.string()),
      centroId: opt(z.string()),
      projetoId: opt(z.string()),
      observacoes: opt(z.string()),
    }),
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i, { user }) => {
    const periodoIni = data(i.periodoIni) ?? null;
    const periodoFim = data(i.periodoFim) ?? null;
    const centroId = i.centroId || null;
    const projetoId = i.projetoId || null;

    const plano = await prisma.planejamentoPagamento.create({
      data: {
        nome: i.nome,
        saldoDisponivel: i.saldoDisponivel,
        periodoIni,
        periodoFim,
        contaId: i.contaId || null,
        centroId,
        projetoId,
        observacoes: i.observacoes || null,
        responsavelId: user.id,
      },
    });

    const contas = await contasEmAberto({ periodoIni, periodoFim, centroId, projetoId });
    if (contas.length > 0) {
      await prisma.planejamentoLinha.createMany({
        data: contas.map((c, idx) => ({
          planoId: plano.id,
          lancamentoId: c.id,
          ordem: idx,
          valorPlanejado: c.valor,
          selecionada: true,
        })),
      });
    }
    rev();
    return { id: plano.id, linhas: contas.length };
  },
);

/** Atualiza o cabeçalho (nome, saldo, observações). */
export const atualizarPlano = defineAction(
  {
    ...base,
    acao: "atualizar-plano-pagamento",
    entidade: "PlanejamentoPagamento",
    schema: z.object({
      id: z.string().min(1),
      nome: z.string().min(1),
      saldoDisponivel: z.number().min(0),
      observacoes: opt(z.string()),
    }),
  },
  async (i) => {
    await prisma.planejamentoPagamento.update({
      where: { id: i.id },
      data: { nome: i.nome, saldoDisponivel: i.saldoDisponivel, observacoes: i.observacoes || null },
    });
    rev(i.id);
    return { id: i.id };
  },
);

/** Salva ordem, valor planejado e seleção das linhas (drag-and-drop / edição inline). */
export const salvarLinhas = defineAction(
  {
    ...base,
    acao: "salvar-linhas-plano",
    entidade: "PlanejamentoLinha",
    schema: z.object({
      id: z.string().min(1),
      linhas: z
        .array(
          z.object({
            id: z.string().min(1),
            ordem: z.number().int(),
            valorPlanejado: z.number().min(0),
            selecionada: z.boolean(),
          }),
        )
        .max(1000),
    }),
  },
  async (i) => {
    const plano = await prisma.planejamentoPagamento.findUnique({ where: { id: i.id }, select: { status: true } });
    if (!plano) throw new ActionError("Plano não encontrado.");
    if (plano.status === "executado") throw new ActionError("Plano executado não pode ser alterado.");
    await prisma.$transaction(
      i.linhas.map((l) =>
        prisma.planejamentoLinha.update({
          where: { id: l.id },
          data: { ordem: l.ordem, valorPlanejado: l.valorPlanejado, selecionada: l.selecionada },
        }),
      ),
    );
    rev(i.id);
    return { id: i.id, atualizadas: i.linhas.length };
  },
);

/** Adiciona lançamentos previstos ao plano. */
export const adicionarLinhas = defineAction(
  {
    ...base,
    acao: "adicionar-linhas-plano",
    entidade: "PlanejamentoLinha",
    schema: z.object({ id: z.string().min(1), lancamentoIds: z.array(z.string().min(1)).min(1).max(500) }),
  },
  async (i) => {
    const lancs = await prisma.lancamento.findMany({
      where: { id: { in: i.lancamentoIds }, status: "previsto" },
      select: { id: true, valor: true },
    });
    if (lancs.length === 0) throw new ActionError("Nenhum lançamento previsto selecionado.");
    const agg = await prisma.planejamentoLinha.aggregate({ where: { planoId: i.id }, _max: { ordem: true } });
    let ordem = (agg._max.ordem ?? -1) + 1;
    await prisma.planejamentoLinha.createMany({
      data: lancs.map((l) => ({ planoId: i.id, lancamentoId: l.id, ordem: ordem++, valorPlanejado: l.valor, selecionada: true })),
      skipDuplicates: true,
    });
    rev(i.id);
    return { id: i.id, adicionadas: lancs.length };
  },
);

/** Remove uma linha do plano (não afeta o lançamento). */
export const removerLinha = defineAction(
  { ...base, acao: "remover-linha-plano", entidade: "PlanejamentoLinha", schema: z.object({ id: z.string().min(1), planoId: z.string().min(1) }) },
  async (i) => {
    await prisma.planejamentoLinha.delete({ where: { id: i.id } });
    rev(i.planoId);
    return { id: i.id };
  },
);

/** Muda o status do cenário (rascunho/análise/aprovado/cancelado). Execução é ação à parte. */
export const mudarStatusPlano = defineAction(
  {
    ...base,
    acao: "mudar-status-plano",
    entidade: "PlanejamentoPagamento",
    schema: z.object({ id: z.string().min(1), status: z.enum(["rascunho", "analise", "aprovado", "cancelado"]) }),
  },
  async (i, { user }) => {
    const plano = await prisma.planejamentoPagamento.findUnique({ where: { id: i.id }, select: { status: true } });
    if (!plano) throw new ActionError("Plano não encontrado.");
    if (plano.status === "executado") throw new ActionError("Plano já executado.");
    await prisma.planejamentoPagamento.update({
      where: { id: i.id },
      data: {
        status: i.status,
        aprovadoPorId: i.status === "aprovado" ? user.id : null,
        aprovadoEm: i.status === "aprovado" ? new Date() : null,
      },
    });
    rev(i.id);
    return { id: i.id, status: i.status };
  },
);

/**
 * Executa o plano aprovado: confirma (paga) cada linha selecionada pelo valor planejado.
 * Em pagamento parcial, o saldo restante vira um novo lançamento previsto (em aberto).
 */
export const executarPlano = defineAction(
  { ...base, acao: "executar-plano-pagamento", entidade: "PlanejamentoPagamento", schema: z.object({ id: z.string().min(1) }) },
  async (i, { user }) => {
    const plano = await prisma.planejamentoPagamento.findUnique({
      where: { id: i.id },
      include: { linhas: { where: { selecionada: true }, include: { lancamento: true } } },
    });
    if (!plano) throw new ActionError("Plano não encontrado.");
    if (plano.status !== "aprovado") throw new ActionError("Só planos aprovados podem ser executados.");

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    let pagos = 0;
    const agora = new Date();
    for (const ln of plano.linhas) {
      const lanc = ln.lancamento;
      if (lanc.status !== "previsto") continue;
      const valorPago = Number(ln.valorPlanejado);
      if (valorPago <= 0) continue;
      pagos += 1;
      ops.push(
        prisma.lancamento.update({
          where: { id: lanc.id },
          data: {
            status: "confirmado",
            dataConfirmacao: agora,
            valorEfetivo: valorPago,
            statusHistorico: { create: { de: lanc.status, para: "confirmado", autorId: user.id } },
          },
        }),
      );
      const restante = saldoRestante(Number(lanc.valor), valorPago);
      if (restante != null) {
        ops.push(
          prisma.lancamento.create({
            data: {
              tipo: lanc.tipo,
              descricao: lanc.descricao,
              valor: restante,
              status: "previsto",
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
              observacao: [lanc.observacao, "Saldo restante de pagamento parcial (planejamento)"].filter(Boolean).join(" · "),
              recorrenciaGrupo: lanc.recorrenciaGrupo ?? lanc.id,
              autorId: user.id,
            },
          }),
        );
      }
    }
    if (pagos === 0) throw new ActionError("Nenhuma linha elegível (lançamento previsto) para executar.");
    ops.push(
      prisma.planejamentoPagamento.update({ where: { id: i.id }, data: { status: "executado", executadoEm: agora } }),
    );
    await prisma.$transaction(ops);
    rev(i.id);
    return { id: i.id, pagos };
  },
);

/** Exclui o cenário (as linhas caem em cascata; lançamentos não são afetados). */
export const excluirPlano = defineAction(
  { ...base, acao: "excluir-plano-pagamento", entidade: "PlanejamentoPagamento", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.planejamentoPagamento.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
