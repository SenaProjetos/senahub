"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { faturarEntregaDaDisciplina } from "@/modules/projetos/receita/faturamento";
import { gerarParcelasDoProjeto, limparParcelasDoProjeto } from "@/modules/projetos/receita/parcelas-service";

function rev(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}`);
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/contas-a-receber");
}

/** Define/atualiza o valor de contrato do projeto. */
export const definirValorContrato = defineAction(
  {
    modulo: "projetos",
    acao: "definir-valor-contrato",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "Projeto",
    schema: z.object({ projetoId: z.string().min(1), valorContrato: z.number().nonnegative().nullable() }),
    entidadeId: (d, i) => ((d ?? i) as { projetoId: string }).projetoId,
  },
  async (i) => {
    await prisma.projeto.update({ where: { id: i.projetoId }, data: { valorContrato: i.valorContrato } });
    rev(i.projetoId);
    return { projetoId: i.projetoId };
  },
);

/**
 * Salva a composição de preço (memória de cálculo) do projeto, substituindo os itens. Mora na
 * aba Financeiro desde 2026-09-29 — a tela só abre com `financeiro:ver`; o gate de escrita é o
 * mesmo do valor de contrato, que ela substitui como referência de receita.
 */
export const salvarComposicaoPreco = defineAction(
  {
    modulo: "projetos",
    acao: "salvar-composicao",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "ProjetoComposicaoPreco",
    schema: z.object({
      projetoId: z.string().min(1),
      observacao: z.string().optional().or(z.literal("")),
      itens: z
        .array(
          z.object({
            descricao: z.string().trim().min(1, "Descreva cada item."),
            quantidade: z.number().min(0),
            valorUnitario: z.number().min(0),
          }),
        )
        .max(200),
    }),
    entidadeId: (_d, i) => i.projetoId,
    capturarAntes: async (i) =>
      prisma.projetoComposicaoPreco.findUnique({ where: { projetoId: i.projetoId }, include: { itens: true } }),
  },
  async (i) => {
    await prisma.$transaction(async (tx) => {
      const comp = await tx.projetoComposicaoPreco.upsert({
        where: { projetoId: i.projetoId },
        create: { projetoId: i.projetoId, observacao: i.observacao || null },
        update: { observacao: i.observacao || null },
      });
      await tx.itemComposicaoPreco.deleteMany({ where: { composicaoId: comp.id } });
      if (i.itens.length > 0) {
        await tx.itemComposicaoPreco.createMany({
          data: i.itens.map((it, n) => ({
            composicaoId: comp.id,
            descricao: it.descricao,
            quantidade: it.quantidade,
            valorUnitario: it.valorUnitario,
            ordem: n,
          })),
        });
      }
    });
    rev(i.projetoId);
    revalidatePath(`/projetos/${i.projetoId}/financeiro`);
    return { projetoId: i.projetoId };
  },
);

/**
 * Gera N parcelas de recebível (receita PREVISTA) para o que falta receber de `valorTotal` (o total
 * do contrato menos o que já entrou pelas parcelas geradas), vencendo a partir de `dataPrimeira` a
 * cada `intervaloMeses`. Substitui só as parcelas GERADAS em aberto: recebidas e faturamento por
 * entrega ficam (A6). Reusa Lancamento.
 */
export const gerarParcelas = defineAction(
  {
    modulo: "financeiro",
    acao: "gerar-parcelas-projeto",
    recurso: "financeiro",
    permissao: "gerir",
    entidade: "Lancamento",
    schema: z.object({
      projetoId: z.string().min(1),
      valorTotal: z.number().positive("Informe um valor positivo."),
      numeroParcelas: z.number().int().min(1).max(120),
      dataPrimeira: z.string().min(1, "Informe a data da primeira parcela."),
      intervaloMeses: z.number().int().min(0).max(12).default(1),
    }),
    entidadeId: (d, i) => ((d ?? i) as { projetoId: string }).projetoId,
  },
  async (i, { user }) => {
    const r = await gerarParcelasDoProjeto({ ...i, autorId: user.id });
    rev(i.projetoId);
    return { projetoId: i.projetoId, parcelas: r.parcelas, recebido: r.recebido };
  },
);

/**
 * N-26: fatura a entrega de uma disciplina com o valor que quem fatura informa (a tela sugere o do
 * item da proposta). Regras em `faturamento.ts`: nunca cobra o `Disciplina.valor` (custo do projetista)
 * e recusa quando o contrato do projeto é cobrado por entrega.
 */
export const faturarEntrega = defineAction(
  {
    modulo: "financeiro",
    acao: "faturar-entrega",
    recurso: "financeiro",
    permissao: "gerir",
    entidade: "Lancamento",
    schema: z.object({
      disciplinaId: z.string().min(1),
      valor: z.number().positive("Informe o valor a cobrar do cliente por esta entrega.").max(999_999_999),
    }),
    entidadeId: (d, i) => ((d ?? i) as { disciplinaId: string }).disciplinaId,
  },
  async (i, { user }) => {
    const r = await faturarEntregaDaDisciplina({ disciplinaId: i.disciplinaId, valor: i.valor, autorId: user.id });
    rev(r.projetoId);
    return { disciplinaId: r.disciplinaId };
  },
);

/**
 * Remove as parcelas GERADAS ainda em aberto do projeto (exclusão lógica). Faturamento por
 * entrega e recebidas ficam (A6).
 */
export const limparParcelas = defineAction(
  {
    modulo: "financeiro",
    acao: "limpar-parcelas-projeto",
    recurso: "financeiro",
    permissao: "gerir",
    entidade: "Lancamento",
    schema: z.object({ projetoId: z.string().min(1) }),
    entidadeId: (d, i) => ((d ?? i) as { projetoId: string }).projetoId,
  },
  async (i) => {
    const count = await limparParcelasDoProjeto(i.projetoId);
    rev(i.projetoId);
    return { projetoId: i.projetoId, removidas: count };
  },
);
