"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { notificar } from "@/lib/notificar";
import { confirmarDespesaProjetista, criarDespesaProjetistaPrevista } from "@/modules/financeiro/custo/lancamento-custo";
import { sincronizarValorDisciplina } from "@/modules/uploads/pagamento";

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
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
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
    });

    await notificar(pag.projetista.id, {
      titulo: "Pagamento efetivado",
      corpo: `Seu pagamento de ${pag.disciplina.nome} foi efetivado.`,
      href: "/financeiro",
      tag: `pago-${pag.id}`,
    }, { categoria: "pagamento" });

    revalidatePath("/financeiro/folha-projetistas");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro/fluxo-caixa");
    return { id: pag.id };
  },
);

/** Recalcula `FolhaProjetista.total` (agregado gravado) excluindo cancelados. */
async function recalcularTotalFolha(tx: Prisma.TransactionClient, folhaId: string) {
  const agg = await tx.pagamentoProjetista.aggregate({
    where: { folhaId, status: { not: "cancelado" } },
    _sum: { valor: true },
  });
  await tx.folhaProjetista.update({ where: { id: folhaId }, data: { total: agg._sum.valor ?? 0 } });
}

const editarValorSchema = z.object({
  id: z.string().min(1),
  valor: z.number().positive("Informe um valor maior que zero."),
});

/**
 * Corrige o valor de um pagamento PENDENTE direto na folha — a rota de conserto para
 * as linhas de R$ 0,00 que já existem em produção (disciplinas concluídas sem valor
 * antes do gate de aprovação existir). Sincroniza o lançamento previsto (cria quando
 * falta, como nessas linhas) e o total do lote, se houver.
 *
 * Zerar não é uma opção aqui — valor > 0 é exigido pelo schema; para zerar, cancele.
 */
export const editarPagamentoProjetista = defineAction(
  {
    modulo: "financeiro",
    acao: "editar-pagamento-projetista",
    recurso: "financeiro",
    permissao: "gerir",
    entidade: "PagamentoProjetista",
    schema: editarValorSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    capturarAntes: (input) =>
      prisma.pagamentoProjetista.findUnique({
        where: { id: input.id },
        select: { valor: true, status: true },
      }),
  },
  async (input, { user }) => {
    const pag = await prisma.pagamentoProjetista.findUnique({
      where: { id: input.id },
      include: {
        projetista: { select: { name: true, role: true } },
        disciplina: { select: { nome: true, projetoId: true, projeto: { select: { codigo: true } } } },
      },
    });
    if (!pag) throw new ActionError("Pagamento não encontrado.");
    if (pag.status !== "pendente") {
      throw new ActionError(
        pag.status === "pago"
          ? "Este pagamento já foi efetivado — o valor não pode mais ser alterado."
          : "Este pagamento foi cancelado — o valor não pode mais ser alterado.",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.pagamentoProjetista.update({ where: { id: pag.id }, data: { valor: input.valor } });

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
          disciplinaNome: pag.disciplina.nome,
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
    permissao: "gerir",
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
    if (pag.status !== "pendente") {
      throw new ActionError(
        pag.status === "pago"
          ? "Este pagamento já foi efetivado — não pode mais ser cancelado por aqui."
          : "Este pagamento já está cancelado.",
      );
    }

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
