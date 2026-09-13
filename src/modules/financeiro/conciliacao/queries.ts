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

  // G1c/D31: inclui os CONFIRMADOS ainda sem transação, não só os previstos. É o que
  // permite reconciliar um pagamento já pago (produção é sempre confirmado) depois de
  // desfazer uma conciliação errada. Sem isso, a transação solta só teria a opção "criar
  // lançamento" — e criar um lançamento novo para uma despesa que já existe duplica o caixa.
  const candidatos = await prisma.lancamento.findMany({
    where: { status: { in: ["previsto", "confirmado"] }, transacao: null, excluidoEm: null },
    select: { id: true, tipo: true, valor: true, descricao: true, data: true, vencimento: true, status: true },
  });

  const regras = await prisma.regraCategorizacao.findMany({
    where: { ativo: true },
    include: { categoria: { select: { id: true, codigo: true, nome: true } } },
  });

  return transacoes.map((t) => {
    const valorAbs = Math.abs(Number(t.valor));
    const ehReceita = Number(t.valor) > 0;
    const sugestoes = candidatos
      .filter((l) => (ehReceita ? l.tipo === "receita" : l.tipo === "despesa") && Number(l.valor) === valorAbs)
      .map((l) => ({ id: l.id, descricao: l.descricao, valor: Number(l.valor), status: l.status as string }))
      // Previsto primeiro: é o caso normal. Confirmado é a exceção (reconciliar).
      .sort((a, b) => (a.status === b.status ? 0 : a.status === "previsto" ? -1 : 1));
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
