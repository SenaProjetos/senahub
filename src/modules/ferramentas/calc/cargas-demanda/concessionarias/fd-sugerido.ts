/**
 * Peças comuns do FD sugerido por tipo de carga (passo 4b) — **puro**. Cada concessionária tem uma função por tabela,
 * que devolve o valor da tabela e a referência para o relatório; aqui ficam só os tipos de retorno e as regras de
 * leitura que se repetem (faixa sem sobreposição, degraus de kW/kVA, "maior e demais").
 *
 * O valor vem sempre da biblioteca. Célula que o gerador marcou como destoante, ou cuja leitura a norma deixa em
 * aberto, fica fora (`null` = "sem sugestão": a tela pede o valor, como nos demais fatores).
 */

import { valorDaFaixa, type Degrau, type Faixa } from "../fd";
import { referenciaDe } from "../biblioteca/tipos";

/** FD de uma tabela por faixa ou por contagem: `fd` nulo = sem sugestão. */
export type FdSugerido = { fd: number | null; referencia: string };

/** FD por degraus de carga (kW ou kVA) — o cálculo é `aplicarProgressivo`. `degraus` nulo = regra só em texto. */
export type FdProgressivo = { degraus: readonly Degrau[] | null; referencia: string; literal?: string };

/** FD do maior e dos demais (motores, equipamentos). `primeiros` = quantos entram com `fdPrimeiros`. */
export type FdMaiorEDemais = { primeiros: number; fdPrimeiros: number; fdDemais: number; referencia: string };

/** kVA (ou kW) de uma linha de tabela de motor, sem as correntes (pergunta 12 do plano). */
export type PotenciaMotor = { kW: number | null; kVA: number | null; referencia: string };

type Tabela = Parameters<typeof referenciaDe>[0];

/**
 * Valor da faixa que contém `x`, sem a ambiguidade de faixas que se sobrepõem: se mais de uma faixa contém `x` e os
 * valores diferem, devolve `null` (a norma imprime o limite nas duas — ex.: Equatorial T6, "56 a 65" e "65 a 75").
 */
export function valorUnicoDaFaixa<V>(faixas: readonly Faixa<V>[], x: number): V | null {
  const achados = faixas.filter((f) => x >= f.de - 1e-9 && (f.ate == null || x <= f.ate + 1e-9));
  if (achados.length === 0) return null;
  const primeiro = achados[0].valor;
  return achados.every((f) => JSON.stringify(f.valor) === JSON.stringify(primeiro)) ? primeiro : null;
}

/**
 * FD de uma tabela de faixas de número ou de carga: `{ fd, referencia }`. Por padrão vale a primeira faixa que contém
 * `x` (faixas contínuas de carga, "1 < C ≤ 2": o limite compartilhado fica na faixa de baixo). Com
 * `sobreposicaoAmbigua`, um `x` que cai em duas faixas de valores diferentes fica sem sugestão. `pendentes` = valores
 * de `x` que ficam sem sugestão.
 */
export function fdDaFaixa(
  tabela: Tabela,
  faixas: readonly Faixa<number>[],
  x: number,
  opcoes?: { pendentes?: ReadonlySet<number>; sobreposicaoAmbigua?: boolean },
): FdSugerido {
  const referencia = referenciaDe(tabela);
  if (opcoes?.pendentes?.has(x)) return { fd: null, referencia };
  return { fd: opcoes?.sobreposicaoAmbigua ? valorUnicoDaFaixa(faixas, x) : valorDaFaixa(faixas, x), referencia };
}

/**
 * Faixas de carga acumuladas ("100% nos primeiros 20 kW, 40% nos seguintes 80 kW") → degraus. `ate` é o limite
 * ACUMULADO da faixa (como a tabela imprime) e `de` o limite anterior; a última faixa vai até o fim (`ate` nulo).
 */
export function degrausDeFaixasAcumuladas(faixas: readonly { de?: number | null; ate: number | null; fd: number }[]): Degrau[] {
  let anterior = 0;
  return faixas.map((f) => {
    const inicio = f.de ?? anterior;
    const largura = f.ate == null ? null : f.ate - inicio;
    anterior = f.ate ?? anterior;
    return { largura, fd: f.fd };
  });
}

/** "Maior e demais" a partir das duas linhas da tabela. */
export function maiorEDemais(tabela: Tabela, primeiros: number, fdPrimeiros: number, fdDemais: number): FdMaiorEDemais {
  return { primeiros, fdPrimeiros, fdDemais, referencia: referenciaDe(tabela) };
}

/** Número de uma contagem escrita por extenso ("até dois") ou em algarismos ("1ª Bomba", "1"). `null` = não reconhecida. */
export function contagemDoRotulo(rotulo: string): number | null {
  const porExtenso: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, três: 3, tres: 3 };
  const palavra = /\b(um|uma|dois|duas|três|tres)\b/i.exec(rotulo)?.[1];
  if (palavra) return porExtenso[palavra.toLowerCase()];
  const algarismo = /\d+/.exec(rotulo)?.[0];
  return algarismo ? Number(algarismo) : null;
}
