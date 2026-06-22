"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { confirmarDespesaProjetista } from "@/modules/financeiro/custo/lancamento-custo";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;

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
    const pend = await prisma.pagamentoProjetista.findMany({
      where: { folhaId: null, liberadoEm: { gte: ini, lt: fim } },
      select: { id: true },
    });
    if (pend.length === 0) throw new ActionError("Nenhum pagamento liberado no mês fora de lote.");

    const folha = await prisma.$transaction(async (tx) => {
      const existente = await tx.folhaProjetista.findUnique({ where: { ano_mes: { ano, mes } } });
      const f = existente ?? (await tx.folhaProjetista.create({ data: { ano, mes, status: "fechada", fechadaEm: new Date() } }));
      await tx.pagamentoProjetista.updateMany({ where: { id: { in: pend.map((p) => p.id) } }, data: { folhaId: f.id } });
      const agg = await tx.pagamentoProjetista.aggregate({ where: { folhaId: f.id }, _sum: { valor: true } });
      return tx.folhaProjetista.update({
        where: { id: f.id },
        data: { total: agg._sum.valor ?? 0, status: "fechada", fechadaEm: existente?.fechadaEm ?? new Date() },
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
      contaId: z.string().optional().or(z.literal("")),
      formaId: z.string().optional().or(z.literal("")),
      data: z.string().optional().or(z.literal("")),
    }),
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i, { user }) => {
    const folha = await prisma.folhaProjetista.findUnique({
      where: { id: i.id },
      include: {
        pagamentos: {
          where: { status: { not: "pago" } },
          include: {
            projetista: { select: { id: true, name: true } },
            disciplina: { select: { nome: true, projetoId: true, projeto: { select: { codigo: true } } } },
          },
        },
      },
    });
    if (!folha) throw new ActionError("Lote não encontrado.");
    if (folha.pagamentos.length === 0) throw new ActionError("Nenhum pagamento pendente neste lote.");

    const quando = i.data ? new Date(i.data) : new Date();

    await prisma.$transaction(async (tx) => {
      for (const pag of folha.pagamentos) {
        const lancamentoId = await confirmarDespesaProjetista(
          tx,
          {
            id: pag.id,
            lancamentoId: pag.lancamentoId,
            valor: pag.valor,
            tipoProfissional: pag.tipoProfissional,
            projetistaNome: pag.projetista.name,
            disciplinaNome: pag.disciplina.nome,
            projetoId: pag.disciplina.projetoId,
            projetoCodigo: pag.disciplina.projeto.codigo,
          },
          { contaId: i.contaId || null, formaId: i.formaId || null, quando, autorId: user.id },
        );
        await tx.pagamentoProjetista.update({
          where: { id: pag.id },
          data: { status: "pago", pagoEm: quando, lancamentoId },
        });
      }
      await tx.folhaProjetista.update({
        where: { id: folha.id },
        data: { status: "paga", pagaEm: quando },
      });
    });

    const projetistas = [...new Set(folha.pagamentos.map((p) => p.projetista.id))];
    await notificarMuitos(projetistas, {
      titulo: "Pagamento efetivado",
      corpo: `Seu pagamento da folha ${String(folha.mes).padStart(2, "0")}/${folha.ano} foi efetivado.`,
      href: "/financeiro",
      tag: `folha-paga-${folha.id}`,
    });

    revalidatePath("/financeiro/folha-projetistas");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro/fluxo-caixa");
    return { id: folha.id, pagos: folha.pagamentos.length };
  },
);
