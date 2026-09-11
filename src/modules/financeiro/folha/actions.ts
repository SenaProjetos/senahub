"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificar, notificarMuitos } from "@/lib/notificar";
import { confirmarDespesaProjetista, criarDespesaProjetistaPrevista } from "@/modules/financeiro/custo/lancamento-custo";
import { sincronizarValorDisciplina } from "@/modules/uploads/pagamento";
import { recalcularTotalFolha } from "@/modules/financeiro/folha-lote/service";
import {
  MSG_PAGAMENTO_SEM_VALOR,
  erroTransicao,
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

    await prisma.$transaction(async (tx) => {
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
    return { id: pag.id };
  },
);

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
