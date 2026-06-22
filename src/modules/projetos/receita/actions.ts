"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addMonths } from "date-fns";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { TAG_PARCELA_CONTRATO } from "@/modules/projetos/receita/queries";
import { dividirEmParcelas } from "@/modules/projetos/receita/parcelas";

/** Categoria de receita por tipo de projeto (ver seed PLANO_CONTAS). */
const CATEGORIA_RECEITA: Record<string, string> = {
  particular: "1.01",
  licitacao: "1.02",
};

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
    entidadeId: (d) => (d as { projetoId: string }).projetoId,
  },
  async (i) => {
    await prisma.projeto.update({ where: { id: i.projetoId }, data: { valorContrato: i.valorContrato } });
    rev(i.projetoId);
    return { projetoId: i.projetoId };
  },
);

/**
 * Gera N parcelas de recebível (receita PREVISTA) somando `valorTotal`, vencendo a
 * partir de `dataPrimeira` a cada `intervaloMeses`. Substitui as parcelas previstas
 * existentes (as já recebidas/confirmadas são preservadas). Reusa Lancamento.
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
    entidadeId: (d) => (d as { projetoId: string }).projetoId,
  },
  async (i, { user }) => {
    const projeto = await prisma.projeto.findUnique({
      where: { id: i.projetoId },
      select: { tipo: true, codigo: true },
    });
    if (!projeto) throw new ActionError("Projeto não encontrado.");

    const codigoCat = CATEGORIA_RECEITA[projeto.tipo] ?? CATEGORIA_RECEITA.particular;
    const categoria = await prisma.categoriaFinanceira.findUnique({ where: { codigo: codigoCat } });
    if (!categoria) throw new ActionError(`Categoria ${codigoCat} ausente no plano de contas.`);

    const base = new Date(i.dataPrimeira);
    if (Number.isNaN(base.getTime())) throw new ActionError("Data inválida.");

    const n = i.numeroParcelas;
    const valores = dividirEmParcelas(i.valorTotal, n);

    await prisma.$transaction(async (tx) => {
      // Remove as parcelas previstas anteriores (preserva confirmadas).
      await tx.lancamento.deleteMany({
        where: {
          projetoId: i.projetoId,
          tipo: "receita",
          status: "previsto",
          tags: { has: TAG_PARCELA_CONTRATO },
        },
      });
      const registros = valores.map((valor, k) => {
        const venc = addMonths(base, k * i.intervaloMeses);
        return {
          tipo: "receita" as const,
          descricao: `Parcela ${k + 1}/${n} — contrato (${projeto.codigo})`,
          valor,
          status: "previsto" as const,
          data: venc,
          vencimento: venc,
          categoriaId: categoria.id,
          projetoId: i.projetoId,
          tags: [TAG_PARCELA_CONTRATO],
          autorId: user.id,
        };
      });
      await tx.lancamento.createMany({ data: registros });
    });

    rev(i.projetoId);
    return { projetoId: i.projetoId, parcelas: n };
  },
);

/** Remove as parcelas previstas (recebíveis ainda não confirmados) do projeto. */
export const limparParcelas = defineAction(
  {
    modulo: "financeiro",
    acao: "limpar-parcelas-projeto",
    recurso: "financeiro",
    permissao: "gerir",
    entidade: "Lancamento",
    schema: z.object({ projetoId: z.string().min(1) }),
    entidadeId: (d) => (d as { projetoId: string }).projetoId,
  },
  async (i) => {
    const { count } = await prisma.lancamento.deleteMany({
      where: {
        projetoId: i.projetoId,
        tipo: "receita",
        status: "previsto",
        tags: { has: TAG_PARCELA_CONTRATO },
      },
    });
    rev(i.projetoId);
    return { projetoId: i.projetoId, removidas: count };
  },
);
