import "server-only";
import { prisma } from "@/lib/prisma";

/** Quantidade de transações bancárias ainda não conciliadas (badge do dashboard). */
export async function totalTransacoesPendentes(): Promise<number> {
  return prisma.transacaoBancaria.count({ where: { conciliado: false } });
}

/** Transações ainda não conciliadas, com sugestões de lançamento previsto. */
export async function transacoesPendentes(contaId?: string) {
  const transacoes = await prisma.transacaoBancaria.findMany({
    where: { conciliado: false, ...(contaId ? { contaId } : {}) },
    orderBy: { data: "desc" },
    include: { conta: { select: { nome: true } } },
  });

  const previstos = await prisma.lancamento.findMany({
    where: { status: "previsto", transacao: null },
    select: { id: true, tipo: true, valor: true, descricao: true, data: true, vencimento: true },
  });

  const regras = await prisma.regraCategorizacao.findMany({
    where: { ativo: true },
    include: { categoria: { select: { id: true, codigo: true, nome: true } } },
  });

  return transacoes.map((t) => {
    const valorAbs = Math.abs(Number(t.valor));
    const ehReceita = Number(t.valor) > 0;
    const sugestoes = previstos
      .filter((l) => (ehReceita ? l.tipo === "receita" : l.tipo === "despesa") && Number(l.valor) === valorAbs)
      .map((l) => ({ id: l.id, descricao: l.descricao, valor: Number(l.valor) }));
    const desc = t.descricao.toLowerCase();
    const regra = regras.find((r) => desc.includes(r.termo.toLowerCase()));
    return {
      id: t.id,
      data: t.data,
      valor: Number(t.valor),
      descricao: t.descricao,
      conta: t.conta.nome,
      ehReceita,
      sugestoes,
      categoriaSugerida: regra?.categoria ?? null,
    };
  });
}

export type TransacaoPendente = Awaited<ReturnType<typeof transacoesPendentes>>[number];
