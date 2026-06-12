import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Fluxo de caixa: saldo por conta (saldo inicial + confirmados) e
 * movimentos confirmados recentes. Considera valorEfetivo quando houver.
 */
export async function fluxoCaixa(limiteMovimentos = 50) {
  const [contas, confirmados] = await Promise.all([
    prisma.contaBancaria.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" } }),
    prisma.lancamento.findMany({
      where: { status: "confirmado" },
      orderBy: { dataConfirmacao: "desc" },
      include: {
        categoria: { select: { nome: true } },
        conta: { select: { id: true, nome: true } },
      },
    }),
  ]);

  const saldoPorConta = new Map<string, number>();
  for (const c of contas) saldoPorConta.set(c.id, Number(c.saldoInicial));
  let semConta = 0;

  for (const l of confirmados) {
    const valor = Number(l.valorEfetivo ?? l.valor);
    const delta = l.tipo === "receita" ? valor : -valor;
    if (l.contaId && saldoPorConta.has(l.contaId)) {
      saldoPorConta.set(l.contaId, saldoPorConta.get(l.contaId)! + delta);
    } else {
      semConta += delta;
    }
  }

  const contasComSaldo = contas.map((c) => ({
    id: c.id,
    nome: c.nome,
    saldo: saldoPorConta.get(c.id) ?? 0,
  }));
  const saldoTotal = contasComSaldo.reduce((s, c) => s + c.saldo, 0) + semConta;

  const entradas = confirmados
    .filter((l) => l.tipo === "receita")
    .reduce((s, l) => s + Number(l.valorEfetivo ?? l.valor), 0);
  const saidas = confirmados
    .filter((l) => l.tipo === "despesa")
    .reduce((s, l) => s + Number(l.valorEfetivo ?? l.valor), 0);

  return {
    contas: contasComSaldo,
    saldoTotal,
    entradas,
    saidas,
    movimentos: confirmados.slice(0, limiteMovimentos),
  };
}
