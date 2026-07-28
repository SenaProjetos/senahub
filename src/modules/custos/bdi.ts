/**
 * BDI (Benefícios e Despesas Indiretas) — fórmula do Acórdão TCU 2622/2013:
 *
 *   BDI = [((1+AC+S+R+G)·(1+DF)·(1+L)) / (1−I)] − 1
 *
 * AC = administração central · S = seguro · R = risco · G = garantia ·
 * DF = despesas financeiras · L = lucro · I = PIS + COFINS + ISS + CPRB (tributos)
 *
 * Puro, sem I/O — todo percentual entra e sai em pontos percentuais (ex.: 4 = 4%).
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export type EntradaBdi = {
  admCentral: number;
  seguro: number;
  risco: number;
  garantia: number;
  despesasFinanceiras: number;
  lucro: number;
  pis: number;
  cofins: number;
  iss: number;
  cprb: number;
};

export type LinhaDemonstrativoBdi = {
  chave: keyof EntradaBdi;
  rotulo: string;
  percentual: number;
};

export type ResultadoBdi =
  | {
      ok: true;
      /** Percentual final do BDI, já em pontos percentuais (ex.: 27.5 = 27,5%). */
      percentual: number;
      /** Multiplicador equivalente (1 + percentual/100), com 4 casas p/ precisão intermediária. */
      multiplicador: number;
      /** Soma dos 4 tributos (I), em pontos percentuais. */
      tributosTotal: number;
      demonstrativo: LinhaDemonstrativoBdi[];
    }
  | { ok: false; erro: string };

const ROTULOS: Record<keyof EntradaBdi, string> = {
  admCentral: "Administração central (AC)",
  seguro: "Seguro (S)",
  risco: "Risco (R)",
  garantia: "Garantia (G)",
  despesasFinanceiras: "Despesas financeiras (DF)",
  lucro: "Lucro (L)",
  pis: "PIS",
  cofins: "COFINS",
  iss: "ISS",
  cprb: "CPRB",
};

function demonstrativo(entrada: EntradaBdi): LinhaDemonstrativoBdi[] {
  return (Object.keys(ROTULOS) as (keyof EntradaBdi)[]).map((chave) => ({
    chave,
    rotulo: ROTULOS[chave],
    percentual: entrada[chave],
  }));
}

/** Calcula o BDI pelo Acórdão TCU 2622/2013. Rejeita tributos que somam 100% ou mais (denominador zera/inverte). */
export function calcularBdi(entrada: EntradaBdi): ResultadoBdi {
  const ac = entrada.admCentral / 100;
  const s = entrada.seguro / 100;
  const r = entrada.risco / 100;
  const g = entrada.garantia / 100;
  const df = entrada.despesasFinanceiras / 100;
  const l = entrada.lucro / 100;
  const i = (entrada.pis + entrada.cofins + entrada.iss + entrada.cprb) / 100;

  if (i >= 1) {
    return { ok: false, erro: "Soma dos tributos (PIS + COFINS + ISS + CPRB) precisa ser menor que 100%." };
  }

  const numerador = (1 + ac + s + r + g) * (1 + df) * (1 + l);
  const multiplicador = numerador / (1 - i);
  const percentual = round2((multiplicador - 1) * 100);

  return {
    ok: true,
    percentual,
    multiplicador: round4(multiplicador),
    tributosTotal: round2(i * 100),
    demonstrativo: demonstrativo(entrada),
  };
}

/** Aplica um percentual de BDI a um valor monetário, arredondado a centavos. */
export function aplicarBdi(valorSemBdi: number, percentualBdi: number): number {
  return round2(valorSemBdi * (1 + percentualBdi / 100));
}
