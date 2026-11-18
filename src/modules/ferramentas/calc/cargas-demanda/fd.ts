/**
 * Fator de demanda da carga instalada — **puro**. Spec §5, passo 14: D = Σ (P · FD ÷ FP), em kVA.
 *
 * Formas da spec: fixo; faixa inteira (o FD da faixa da carga total vale para tudo); progressivo por faixa de carga
 * (cada faixa com seu FD, em kW ou kVA); nº de aparelhos; maior e demais; duas chaves (nº × potência); motores por
 * potência e quantidade (a tabela já dá kVA). A contagem e as faixas são as do ESCOPO (quantidade × N), nunca a soma
 * de cálculos individuais (spec §3.1, regra 4).
 *
 * As tabelas vêm da biblioteca (`biblioteca/*`); aqui só se aplica a forma. Entre faixas: valor da faixa, sem
 * interpolação (spec §4.2).
 */

/** Faixa de quantidade/carga: `de` e `ate` inclusivos; `ate = null` = "acima de". */
export type Faixa<V> = { de: number; ate: number | null; valor: V };

/** Valor da faixa que contém `x` (sem interpolação). `null` = fora de todas as faixas. */
export function valorDaFaixa<V>(faixas: readonly Faixa<V>[], x: number): V | null {
  for (const f of faixas) {
    if (x >= f.de - 1e-9 && (f.ate == null || x <= f.ate + 1e-9)) return f.valor;
  }
  return null;
}

/**
 * Faixas de ÁREA (m²) escritas com inteiros ("até 40", "41 a 45"…): um valor fracionário entre duas faixas
 * (40,5 m²) cai na faixa seguinte, e um limite compartilhado por duas faixas ("241 - 260" e "260 - 280") fica na
 * primeira. Regra: a primeira faixa cujo limite superior é ≥ x. `null` = acima da última faixa.
 * Leitura adotada pelo desenvolvimento, registrada como pendência para o engenheiro confirmar.
 */
export function valorPorLimiteSuperior<V>(faixas: readonly Faixa<V>[], x: number): V | null {
  for (const f of faixas) {
    if (f.ate == null || x <= f.ate + 1e-9) return f.valor;
  }
  return null;
}

/** Tabela por número inteiro (nº de apartamentos/unidades): `null` fora da tabela. */
export function valorPorNumero(pares: readonly (readonly [number, number])[], n: number): number | null {
  return pares.find(([k]) => k === n)?.[1] ?? null;
}

/** Degrau de uma regra progressiva: `largura` kW (ou kVA) com o FD; `largura = null` = "o restante". */
export type Degrau = { largura: number | null; fd: number };

export type ParteProgressiva = { de: number; ate: number; carga: number; fd: number; demanda: number };

/**
 * Divide a carga em degraus (ex.: 100% nos 10 kW iniciais, 20% nos 110 seguintes, 10% acima de 120).
 * Devolve cada parte (para a tela e o relatório) e a demanda na MESMA unidade da carga.
 */
export function aplicarProgressivo(carga: number, degraus: readonly Degrau[]): { partes: ParteProgressiva[]; demanda: number } {
  const partes: ParteProgressiva[] = [];
  let inicio = 0;
  let resto = carga;
  for (const d of degraus) {
    if (resto <= 0) break;
    const naFaixa = d.largura == null ? resto : Math.min(resto, d.largura);
    partes.push({ de: inicio, ate: inicio + naFaixa, carga: naFaixa, fd: d.fd, demanda: naFaixa * d.fd });
    inicio += naFaixa;
    resto -= naFaixa;
  }
  return { partes, demanda: partes.reduce((s, p) => s + p.demanda, 0) };
}

/** "Maior e demais" (ou "os N primeiros e os restantes"): os `primeiros` aparelhos com `fdPrimeiros`, o resto com `fdDemais`. */
export function aplicarMaiorEDemais(
  potenciasUnitarias: readonly number[],
  regra: { primeiros: number; fdPrimeiros: number; fdDemais: number },
): number {
  const ordenadas = [...potenciasUnitarias].sort((a, b) => b - a);
  return ordenadas.reduce((s, p, i) => s + p * (i < regra.primeiros ? regra.fdPrimeiros : regra.fdDemais), 0);
}

/** Demanda em kVA de uma linha com FD único: P (kW) · FD ÷ FP. */
export function demandaKVA(pKW: number, fd: number, fp: number): number {
  return (pKW * fd) / fp;
}
