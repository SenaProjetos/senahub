"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/notificar";
import { CATEGORIA_POR_TIPO } from "@/modules/financeiro/custo/lancamento-custo";

const pagarSchema = z.object({
  id: z.string().min(1),
  contaId: z.string().optional().or(z.literal("")),
  formaId: z.string().optional().or(z.literal("")),
  data: z.string().optional().or(z.literal("")),
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

    const quando = i.data ? new Date(i.data) : new Date();

    await prisma.$transaction(async (tx) => {
      // Lançamento previsto criado na validação da entrega.
      const previsto = pag.lancamentoId
        ? await tx.lancamento.findUnique({ where: { id: pag.lancamentoId } })
        : await tx.lancamento.findUnique({ where: { pagamentoProjetistaId: pag.id } });

      let lancamentoId: string;
      if (previsto && previsto.status !== "cancelado") {
        // Confirma o previsto existente (sem criar um segundo).
        await tx.lancamento.update({
          where: { id: previsto.id },
          data: {
            status: "confirmado",
            dataConfirmacao: quando,
            contaId: i.contaId || previsto.contaId,
            formaId: i.formaId || previsto.formaId,
          },
        });
        lancamentoId = previsto.id;
      } else {
        // Fallback (dado legado sem previsto): cria já confirmado.
        const codigo = CATEGORIA_POR_TIPO[pag.tipoProfissional] ?? CATEGORIA_POR_TIPO.projetista_pj;
        const categoria = await tx.categoriaFinanceira.findUnique({ where: { codigo } });
        if (!categoria) throw new ActionError(`Categoria ${codigo} ausente no plano de contas.`);
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
        lancamentoId = lanc.id;
      }
      await tx.pagamentoProjetista.update({
        where: { id: pag.id },
        data: { status: "pago", pagoEm: quando, lancamentoId },
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
