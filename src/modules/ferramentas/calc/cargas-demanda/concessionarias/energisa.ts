/**
 * Energisa — critério da área útil da NDU-003, 9.2 e 9.4.1 (anexo G da spec) — **puro**.
 *   d1 = Σ f × a     (kW; a: Tabela 7 pela área; f: Tabela 6 pelo nº de unidades; metragens distintas: por conjunto
 *                     de mesma área, cada um com o seu f)
 *   D  = (d1 + d2) × 1,3 + dce   (kVA; o 1,3 é lido da equação do 9.4.1; vale para apartamentos E condomínio)
 * Aqui sai a parcela dos apartamentos, d1 × 1,3, e o 1,3 volta em `fatorDoConjunto` para a composição aplicá-lo ao d2.
 * Duplex (1,52) e lojas (1,1) ficam para a composição do nível (passo 5 do plano).
 */

import { NDU003_TABELA_6, NDU003_TABELA_7 } from "../biblioteca/energisa";
import { ENERGISA_NDU003_TRECHOS } from "../biblioteca/energisa-ndu003-trechos";
import { referenciaDe } from "../biblioteca/tipos";
import { avisosDeFaltantes, fatoresPorTipo, valorDaArea } from "./area";
import { lerDoTrecho } from "./texto";
import { avisosAbaixoDaNorma, fator, produto, type Ajustes, type ResultadoAreaUtil, type TipoApartamento } from "./tipos";

export const NOME = "Energisa";

export const MULTIPLICADOR = lerDoTrecho(ENERGISA_NDU003_TRECHOS, "9.4", /D = \(d1 \+ d2\) × ([\d,]+) \+ dce/);

/** a sugerido (kW): Tabela 7; acima dela, sem sugestão (pergunta 5 do plano). */
export function aSugerido(areaM2: number): number | null {
  return valorDaArea(NDU003_TABELA_7.linhas, areaM2);
}

export function fSugerido(unidades: number): number | null {
  return NDU003_TABELA_6.linhas.find(([n]) => n === unidades)?.[1] ?? null;
}

export function demandaAreaUtil(tipos: readonly TipoApartamento[], ajustes?: Ajustes): ResultadoAreaUtil {
  const refA = referenciaDe(NDU003_TABELA_7);
  const refF = referenciaDe(NDU003_TABELA_6);
  const as = fatoresPorTipo(tipos, "a", (t) => `Demanda por área (${t.nome})`, (t) => ({ valor: aSugerido(t.areaUtilM2), referencia: refA }), ajustes, {
    simbolo: "a",
    unidade: "kW",
  });
  const fs = fatoresPorTipo(tipos, "f", (t) => `Fator de multiplicação (${t.nome})`, (t) => ({ valor: fSugerido(t.quantidade), referencia: refF }), ajustes, {
    simbolo: "f",
  });
  const m = fator("multiplicador", "Fator multiplicativo", MULTIPLICADOR.valores[0], MULTIPLICADOR.referencia, ajustes);
  const soma = (usar: "adotado" | "sugerido") => {
    const partes = as.map((a, i) => produto([fs[i][usar], a[usar]]));
    return partes.some((p) => p == null) ? null : partes.reduce<number>((s, p) => s + (p as number), 0);
  };
  const d1 = soma("adotado");
  const fatores = [...as.flatMap((a, i) => [fs[i], a]), m];
  return {
    fatores,
    passos: [
      { chave: "d1", rotulo: "Carga demandada dos apartamentos", simbolo: "d1", valor: d1, unidade: "kW", formula: "Σ f × a" },
      { chave: "d1m", rotulo: "Demanda dos apartamentos", valor: produto([d1, m.adotado]), unidade: "kVA", formula: "d1 × fator multiplicativo" },
    ],
    demandaKVA: produto([d1, m.adotado]),
    demandaCriterioKVA: produto([soma("sugerido"), m.sugerido]),
    fatorDoConjunto: m,
    avisos: [...avisosDeFaltantes(fatores), ...avisosAbaixoDaNorma(fatores, NOME)],
  };
}
