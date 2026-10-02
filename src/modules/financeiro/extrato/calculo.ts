/**
 * Extrato por conta (M0 do Financeiro). Puro, sem I/O, tudo em centavos e dias `YYYY-MM-DD`.
 *
 * O extrato é o que entrou e saiu de UMA conta, pela data do pagamento, com saldo corrido: saldo inicial
 * da conta + o realizado até o dia anterior ao período, depois linha a linha. Transferência entre contas
 * próprias conta (move o saldo da conta); lançamento sem conta não é de nenhuma — nunca entra aqui.
 */

export type MovimentoDaConta = {
  id: string;
  /** Dia do pagamento. */
  dia: string;
  /** Desempate dentro do mesmo dia: ordem de criação. */
  ordem: string;
  tipo: "receita" | "despesa";
  valorCentavos: number;
};

export type LinhaDoExtrato<M extends MovimentoDaConta> = M & {
  /** Positivo para entrada, negativo para saída. */
  efeitoCentavos: number;
  /** Saldo da conta depois desta linha. */
  saldoCentavos: number;
};

export type Extrato<M extends MovimentoDaConta> = {
  saldoAnteriorCentavos: number;
  linhas: LinhaDoExtrato<M>[];
  entradasCentavos: number;
  saidasCentavos: number;
  saldoFinalCentavos: number;
};

export const efeito = (m: Pick<MovimentoDaConta, "tipo" | "valorCentavos">): number => (m.tipo === "receita" ? m.valorCentavos : -m.valorCentavos);

/**
 * Monta o extrato de `[de, ate]`. `movimentos` traz TODO o realizado da conta até `ate` (o saldo anterior
 * depende do que veio antes de `de`). A soma de `saldoAnterior + entradas − saídas` é sempre o saldo final.
 */
export function montarExtrato<M extends MovimentoDaConta>(p: {
  saldoInicialCentavos: number;
  movimentos: readonly M[];
  de: string;
  ate: string;
}): Extrato<M> {
  const ordenados = [...p.movimentos].sort((a, b) => a.dia.localeCompare(b.dia) || a.ordem.localeCompare(b.ordem) || a.id.localeCompare(b.id));
  let saldo = p.saldoInicialCentavos;
  let saldoAnterior = p.saldoInicialCentavos;
  let entradas = 0;
  let saidas = 0;
  const linhas: LinhaDoExtrato<M>[] = [];
  for (const m of ordenados) {
    if (m.dia > p.ate) continue;
    const e = efeito(m);
    if (m.dia < p.de) {
      saldo += e;
      saldoAnterior = saldo;
      continue;
    }
    saldo += e;
    if (e >= 0) entradas += e;
    else saidas += -e;
    linhas.push({ ...m, efeitoCentavos: e, saldoCentavos: saldo });
  }
  return { saldoAnteriorCentavos: saldoAnterior, linhas, entradasCentavos: entradas, saidasCentavos: saidas, saldoFinalCentavos: saldo };
}

export type ConferenciaDeSaldo = { dia: string; bancoCentavos: number; sistemaCentavos: number; diferencaCentavos: number; confere: boolean };

/** Banco × sistema na mesma data. */
export function conferirSaldo(p: { dia: string; bancoCentavos: number; sistemaCentavos: number }): ConferenciaDeSaldo {
  const diferenca = p.bancoCentavos - p.sistemaCentavos;
  return { dia: p.dia, bancoCentavos: p.bancoCentavos, sistemaCentavos: p.sistemaCentavos, diferencaCentavos: diferenca, confere: diferenca === 0 };
}

export type FiltroConciliacao = "tudo" | "conciliado" | "falta";

export function passaConciliacao(conciliado: boolean, f: FiltroConciliacao): boolean {
  return f === "tudo" || (f === "conciliado" ? conciliado : !conciliado);
}
