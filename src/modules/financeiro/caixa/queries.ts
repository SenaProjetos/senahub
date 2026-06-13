import "server-only";
import { addDays, differenceInCalendarDays } from "date-fns";
import { prisma } from "@/lib/prisma";

export type SemanaProjecao = {
  inicio: string;
  fim: string;
  entradas: number;
  saidas: number;
  saldo: number;
};

/**
 * Projeção de caixa: a partir do saldo atual, projeta o saldo semana a semana
 * usando os lançamentos PREVISTOS (a receber/pagar) por vencimento. Detecta gap (saldo < 0).
 */
export async function projecaoCaixa(saldoInicial: number, semanas = 8): Promise<SemanaProjecao[]> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = addDays(hoje, semanas * 7);
  const previstos = await prisma.lancamento.findMany({
    where: { status: "previsto", vencimento: { gte: hoje, lte: fim } },
    select: { tipo: true, valor: true, vencimento: true },
  });

  const buckets: SemanaProjecao[] = Array.from({ length: semanas }, (_, i) => {
    const ini = addDays(hoje, i * 7);
    return {
      inicio: ini.toISOString().slice(0, 10),
      fim: addDays(ini, 6).toISOString().slice(0, 10),
      entradas: 0,
      saidas: 0,
      saldo: 0,
    };
  });
  for (const l of previstos) {
    if (!l.vencimento) continue;
    const idx = Math.floor(differenceInCalendarDays(l.vencimento, hoje) / 7);
    if (idx < 0 || idx >= semanas) continue;
    if (l.tipo === "receita") buckets[idx].entradas += Number(l.valor);
    else buckets[idx].saidas += Number(l.valor);
  }
  let saldo = saldoInicial;
  for (const b of buckets) {
    saldo += b.entradas - b.saidas;
    b.saldo = saldo;
  }
  return buckets;
}

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
