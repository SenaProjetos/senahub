"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addMonths } from "date-fns";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { TAG_PARCELA_CONTRATO, contratosDeCobranca } from "@/modules/projetos/receita/queries";
import { avisoCobrancaContrato } from "@/modules/projetos/receita/cobranca-contrato";
import { codigoCategoriaReceita } from "@/modules/projetos/receita/categoria";
import { faturarEntregaDaDisciplina } from "@/modules/projetos/receita/faturamento";
import { dividirEmParcelas } from "@/modules/projetos/receita/parcelas";

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
    entidadeId: (d, i) => ((d ?? i) as { projetoId: string }).projetoId,
  },
  async (i, { user }) => {
    const projeto = await prisma.projeto.findUnique({
      where: { id: i.projetoId },
      select: { tipo: true, codigo: true },
    });
    if (!projeto) throw new ActionError("Projeto não encontrado.");

    const aviso = avisoCobrancaContrato(await contratosDeCobranca(i.projetoId));
    if (aviso?.nivel === "recusa") throw new ActionError(aviso.texto);

    const codigoCat = codigoCategoriaReceita(projeto.tipo);
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

/** Remove as parcelas previstas (recebíveis ainda não confirmados) do projeto. */
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
