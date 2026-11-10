/**
 * Celesc — empreendimento residencial da N-321.0003, 5.6.2 (anexo D da spec) — **puro**.
 *   DP = k · (D1 + D2) + De + Ds;   D1 = F · Da
 *   F: Tabela 01 pelo nº de apartamentos; Da: Tabela 02 pela área média ponderada (por m²; "ATÉ 70 m²" = 1,57);
 *   acima de 400 m², Da = 0,034939 · A^0,895075 (constantes do 5.6.2 na biblioteca).
 * O k vale para apartamentos E condomínio: aqui entra em `demandaKVA` (k · D1) e volta em `fatorDoConjunto` para a
 * composição do nível aplicá-lo também ao D2.
 */

import { CELESC_562, CELESC_TABELA_01, CELESC_TABELA_02, N_321_0003 } from "../biblioteca/celesc";
import { referenciaDe } from "../biblioteca/tipos";
import { avisosDeFaltantes, formulaDaArea, valorDaArea } from "./area";
import {
  areaMediaPonderada,
  avisosAbaixoDaNorma,
  fator,
  produto,
  totalDeApartamentos,
  type Ajustes,
  type ResultadoAreaUtil,
  type TipoApartamento,
} from "./tipos";

export const NOME = "Celesc";
const REF_562 = `${N_321_0003.documento} ${N_321_0003.edicao}, ${CELESC_562.item}`;

/** Da sugerido (kVA): Tabela 02 até a área máxima; acima, a fórmula do 5.6.2. */
export function daSugerido(areaM2: number): { valor: number | null; referencia: string } {
  if (areaM2 > CELESC_562.areaMaximaTabela) {
    return { valor: formulaDaArea(CELESC_562.formulaCoef, CELESC_562.formulaExpoente, areaM2), referencia: REF_562 };
  }
  return { valor: valorDaArea(CELESC_TABELA_02.linhas, areaM2), referencia: referenciaDe(CELESC_TABELA_02) };
}

/** F da Tabela 01 (`null` em 1 apartamento, célula "-"). */
export function fSugerido(apartamentos: number): number | null {
  return CELESC_TABELA_01.linhas.find(([n]) => n === apartamentos)?.[1] ?? null;
}

export function demandaAreaUtil(tipos: readonly TipoApartamento[], ajustes?: Ajustes): ResultadoAreaUtil {
  const area = areaMediaPonderada(tipos);
  const sug = daSugerido(area);
  const da = fator("da", "Demanda por apartamento", sug.valor, sug.referencia, ajustes, { simbolo: "Da", unidade: "kVA" });
  const f = fator("f", "Fator de diversidade", fSugerido(totalDeApartamentos(tipos)), referenciaDe(CELESC_TABELA_01), ajustes, {
    simbolo: "F",
  });
  const k = fator("k", "Fator de majoração", CELESC_562.k, REF_562, ajustes, { simbolo: "k" });
  const d1 = produto([f.adotado, da.adotado]);
  const fatores = [da, f, k];
  return {
    fatores,
    passos: [
      { chave: "area", rotulo: "Área média ponderada", valor: area, unidade: "m²", formula: "Σ (n · A) ÷ Σ n" },
      { chave: "d1", rotulo: "Demanda dos apartamentos", simbolo: "D1", valor: d1, unidade: "kVA", formula: "F × Da" },
      { chave: "kd1", rotulo: "Demanda dos apartamentos com k", valor: produto([k.adotado, d1]), unidade: "kVA", formula: "k × D1" },
    ],
    demandaKVA: produto([k.adotado, d1]),
    demandaCriterioKVA: produto([k.sugerido, f.sugerido, da.sugerido]),
    fatorDoConjunto: k,
    avisos: [...avisosDeFaltantes(fatores), ...avisosAbaixoDaNorma(fatores, NOME)],
  };
}
