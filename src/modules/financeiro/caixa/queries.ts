import "server-only";
import { prisma } from "@/lib/prisma";
import { inicioDoDiaUtc } from "@/lib/data";

const MS_DIA = 86_400_000;

export type SemanaProjecao = {
  inicio: string;
  fim: string;
  entradas: number;
  /** F7.2: parte de `entradas` que é previsão do cronograma (contrato por entrega, ainda não faturada). */
  previsaoCronograma: number;
  /**
   * Parte de `previsaoCronograma` que já passou da data (marco passou, ou a assinatura) e não foi
   * faturada. Vai para a 1ª semana: é dinheiro ainda esperado — e, ao contrário da conta a receber
   * vencida, não aparece em aging nenhum. Tirá-la da projeção a faria sumir de todas as telas.
   */
  previsaoAtrasada: number;
  saidas: number;
  saldo: number;
};

/**
 * Projeção de caixa: a partir do saldo atual, projeta o saldo semana a semana
 * usando os lançamentos PREVISTOS (a receber/pagar) por vencimento. Detecta gap (saldo < 0).
 */
export async function projecaoCaixa(saldoInicial: number, semanas = 8): Promise<SemanaProjecao[]> {
  // `vencimento` é `@db.Date` (meia-noite UTC). Com a meia-noite LOCAL (03:00Z) como corte, o que
  // vence HOJE ficava de fora e cada semana começava um dia errado — a regra de `lib/data.ts`.
  const hoje = inicioDoDiaUtc();
  const fim = new Date(hoje.getTime() + semanas * 7 * MS_DIA);
  const previstos = await prisma.lancamento.findMany({
    where: {
      // F7.2 (D25): a previsão de recebimento do cronograma entra AQUI, e só aqui — é projeção, não
      // conta a receber. Aging, inadimplência e "a receber" leem `previsto` e não a veem. A previsão
      // vencida também entra (vai para a 1ª semana); a conta a receber vencida segue de fora.
      OR: [
        { status: "previsto", vencimento: { gte: hoje, lte: fim } },
        { status: "previsao", tipo: "receita", vencimento: { lte: fim } },
      ],
    },
    select: { tipo: true, valor: true, vencimento: true, status: true },
  });

  const buckets: SemanaProjecao[] = Array.from({ length: semanas }, (_, i) => {
    const ini = new Date(hoje.getTime() + i * 7 * MS_DIA);
    return {
      inicio: ini.toISOString().slice(0, 10),
      fim: new Date(ini.getTime() + 6 * MS_DIA).toISOString().slice(0, 10),
      entradas: 0,
      previsaoCronograma: 0,
      previsaoAtrasada: 0,
      saidas: 0,
      saldo: 0,
    };
  });
  for (const l of previstos) {
    if (!l.vencimento) continue;
    const dias = Math.round((l.vencimento.getTime() - hoje.getTime()) / MS_DIA);
    const atrasada = l.status === "previsao" && dias < 0;
    const idx = atrasada ? 0 : Math.floor(dias / 7);
    if (idx < 0 || idx >= semanas) continue;
    if (l.tipo === "receita") {
      buckets[idx].entradas += Number(l.valor);
      if (l.status === "previsao") buckets[idx].previsaoCronograma += Number(l.valor);
      if (atrasada) buckets[idx].previsaoAtrasada += Number(l.valor);
    } else buckets[idx].saidas += Number(l.valor);
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
