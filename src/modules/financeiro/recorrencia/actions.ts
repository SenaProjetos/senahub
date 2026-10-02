"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ActionError, defineAction } from "@/lib/with-action";
import { competenciaValida } from "@/modules/financeiro/recorrencia/calculo";
import { compromissoSchema, idCompromissoSchema, vincularSchema, idLancamentoVinculoSchema } from "@/modules/financeiro/recorrencia/schemas";
import { desvincularLancamento, gerarLancamentosRecorrentes, vincularLancamento } from "@/modules/financeiro/recorrencia/service";

/**
 * Compromissos recorrentes (ADR-0009). Ver é de quem vê o Financeiro; cadastrar, gerar e vincular
 * exigem `financeiro:gerir`. O cadastro NÃO cria contas a pagar: elas nascem perto do vencimento.
 */
const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir", entidade: "CompromissoRecorrente" } as const;

function rev() {
  revalidatePath("/financeiro/cadastros");
  revalidatePath("/financeiro/planejador");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro");
}

export const salvarCompromisso = defineAction(
  {
    ...base,
    acao: "salvar-compromisso-recorrente",
    schema: compromissoSchema,
    capturarAntes: async (i) => (i.id ? prisma.compromissoRecorrente.findUnique({ where: { id: i.id } }) : null),
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i) => {
    if (i.competenciaFim && i.competenciaFim < i.competenciaInicio) throw new ActionError("A última competência é anterior à primeira.");
    if (!competenciaValida(i.competenciaInicio) || (i.competenciaFim && !competenciaValida(i.competenciaFim))) {
      throw new ActionError("Competência inválida: use o formato AAAA-MM.");
    }
    const cat = await prisma.categoriaFinanceira.findUnique({ where: { id: i.categoriaId }, select: { tipo: true, ativo: true } });
    if (!cat?.ativo || cat.tipo !== "despesa") throw new ActionError("Escolha uma categoria de despesa ativa.");
    if (i.socioId) {
      const s = await prisma.socio.findUnique({ where: { id: i.socioId }, select: { ativo: true } });
      if (!s?.ativo) throw new ActionError("O sócio escolhido não existe ou está inativo.");
    }
    if (i.caixinhaId) {
      const c = await prisma.caixinha.findUnique({ where: { id: i.caixinhaId }, select: { ativo: true } });
      if (!c?.ativo) throw new ActionError("A caixinha escolhida não existe ou está arquivada.");
    }

    const dados = {
      descricao: i.descricao,
      valor: i.valor,
      diaVencimento: i.diaVencimento,
      regraVencimento: i.regraVencimento,
      mesesAteVencimento: i.mesesAteVencimento,
      adiantamento: i.adiantamento,
      competenciaInicio: i.competenciaInicio,
      competenciaFim: i.competenciaFim || null,
      categoriaId: i.categoriaId,
      socioId: i.socioId || null,
      caixinhaId: i.caixinhaId || null,
      prioridade: i.prioridade ?? null,
      antecedenciaDias: i.antecedenciaDias,
    };
    if (i.id) {
      const atual = await prisma.compromissoRecorrente.findUnique({ where: { id: i.id }, select: { id: true } });
      if (!atual) throw new ActionError("Compromisso não encontrado.");
      // Mudar o valor vale só para as competências ainda NÃO geradas: as que já viraram lançamento
      // seguem com o valor delas (o lançamento é que manda, §9).
      await prisma.compromissoRecorrente.update({ where: { id: i.id }, data: dados });
      rev();
      return { id: i.id };
    }
    const novo = await prisma.compromissoRecorrente.create({ data: dados, select: { id: true } });
    rev();
    return { id: novo.id };
  },
);

export const alternarAtivoCompromisso = defineAction(
  { ...base, acao: "alternar-compromisso-recorrente", schema: idCompromissoSchema, entidadeId: (_d, i) => i.id },
  async (i) => {
    const c = await prisma.compromissoRecorrente.findUnique({ where: { id: i.id }, select: { ativo: true } });
    if (!c) throw new ActionError("Compromisso não encontrado.");
    await prisma.compromissoRecorrente.update({ where: { id: i.id }, data: { ativo: !c.ativo } });
    rev();
    return { ativo: !c.ativo };
  },
);

/** Só exclui o que nunca gerou lançamento; o resto fica inativo, para o histórico manter a origem. */
export const excluirCompromisso = defineAction(
  {
    ...base,
    acao: "excluir-compromisso-recorrente",
    schema: idCompromissoSchema,
    capturarAntes: (i) => prisma.compromissoRecorrente.findUnique({ where: { id: i.id } }),
    entidadeId: (_d, i) => i.id,
  },
  async (i) => {
    const c = await prisma.compromissoRecorrente.findUnique({ where: { id: i.id }, select: { _count: { select: { lancamentos: true } } } });
    if (!c) throw new ActionError("Compromisso não encontrado.");
    if (c._count.lancamentos > 0) throw new ActionError("Já gerou lançamentos. Deixe inativo para manter a origem deles.");
    await prisma.compromissoRecorrente.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

/** "Gerar agora": a mesma rotina do job diário, idempotente pelo par único. */
export const gerarAgora = defineAction({ ...base, acao: "gerar-lancamentos-recorrentes", schema: undefined }, async (_i, { user }) => {
  const r = await gerarLancamentosRecorrentes({ autorId: user.id });
  rev();
  return r;
});

export const vincularLancamentoARecorrencia = defineAction(
  { ...base, acao: "vincular-lancamento-recorrencia", entidade: "Lancamento", schema: vincularSchema, entidadeId: (_d, i) => i.lancamentoId },
  async (i) => {
    await vincularLancamento({ lancamentoId: i.lancamentoId, compromissoId: i.compromissoId, competencia: i.competencia });
    rev();
    return { id: i.lancamentoId };
  },
);

export const desvincularLancamentoDaRecorrencia = defineAction(
  { ...base, acao: "desvincular-lancamento-recorrencia", entidade: "Lancamento", schema: idLancamentoVinculoSchema, entidadeId: (_d, i) => i.lancamentoId },
  async (i) => {
    await desvincularLancamento(i.lancamentoId);
    rev();
    return { id: i.lancamentoId };
  },
);
