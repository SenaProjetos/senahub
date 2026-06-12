"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/notificar";

/** Código do plano de contas por tipo de profissional (ver seed). */
const CATEGORIA_POR_TIPO: Record<string, string> = {
  projetista_pj: "2.01",
  freelancer: "2.02",
  clt: "2.03",
  estagiario: "2.04",
};

const pagarSchema = z.object({
  id: z.string().min(1),
  contaId: z.string().optional().or(z.literal("")),
  formaId: z.string().optional().or(z.literal("")),
  data: z.string().optional().or(z.literal("")),
});

/**
 * Efetiva o pagamento ao projetista: marca pago e cria um Lançamento
 * (despesa CONFIRMADA) na categoria correta → entra no caixa e na DRE.
 * Fluxo B da regra de ouro (continuação).
 */
export const pagarProjetista = defineAction(
  {
    modulo: "financeiro",
    acao: "pagar-projetista",
    recurso: "financeiro",
    permissao: "gerir",
    entidade: "PagamentoProjetista",
    schema: pagarSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i, { user }) => {
    const pag = await prisma.pagamentoProjetista.findUnique({
      where: { id: i.id },
      include: {
        projetista: { select: { id: true, name: true } },
        disciplina: { select: { nome: true, projetoId: true, projeto: { select: { codigo: true } } } },
      },
    });
    if (!pag) throw new ActionError("Pagamento não encontrado.");
    if (pag.status === "pago") throw new ActionError("Pagamento já efetivado.");

    const codigo = CATEGORIA_POR_TIPO[pag.tipoProfissional] ?? "2.01";
    const categoria = await prisma.categoriaFinanceira.findUnique({ where: { codigo } });
    if (!categoria) throw new ActionError(`Categoria ${codigo} ausente no plano de contas.`);

    const quando = i.data ? new Date(i.data) : new Date();

    await prisma.$transaction(async (tx) => {
      const lanc = await tx.lancamento.create({
        data: {
          tipo: "despesa",
          descricao: `Projetista ${pag.projetista.name} — ${pag.disciplina.nome} (${pag.disciplina.projeto.codigo})`,
          valor: pag.valor,
          status: "confirmado",
          data: quando,
          dataConfirmacao: quando,
          categoriaId: categoria.id,
          contaId: i.contaId || null,
          formaId: i.formaId || null,
          projetoId: pag.disciplina.projetoId,
          pagamentoProjetistaId: pag.id,
          autorId: user.id,
        },
      });
      await tx.pagamentoProjetista.update({
        where: { id: pag.id },
        data: { status: "pago", pagoEm: quando, lancamentoId: lanc.id },
      });
    });

    await notificar(pag.projetista.id, {
      titulo: "Pagamento efetivado",
      corpo: `Seu pagamento de ${pag.disciplina.nome} foi efetivado.`,
      href: "/financeiro",
      tag: `pago-${pag.id}`,
    });

    revalidatePath("/financeiro/folha-projetistas");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro/fluxo-caixa");
    return { id: pag.id };
  },
);
