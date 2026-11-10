/**
 * Equatorial — critério da área útil da NT.00004, 6.11.4.2 (anexo B da spec) — **puro**.
 *   D1 = S × f                (S: Tabela 25 pela área média ponderada; f: Tabela 26 pelo nº de apartamentos)
 *   parcela dos apartamentos = D1 × 1,2   (o 1,2 é lido da fórmula "D = (D1) x 1,2 + D2 + D3")
 * Área acima da Tabela 25: Y = 0,034939 · X^0,895075 (fórmula do mesmo item, lida do texto).
 * Apart-hotel: a norma manda carga instalada (6.11.8) — o método avisa e a tela não deve usar a área útil.
 */

import { EQT_NT00004_TRECHOS, EQT_TABELA_25, EQT_TABELA_26 } from "../biblioteca/equatorial";
import { referenciaDe } from "../biblioteca/tipos";
import { MSG } from "../mensagens";
import { avisosDeFaltantes, faixasDeArea, formulaDaArea, limiteDaTabela, valorDaArea } from "./area";
import { lerDoTrecho } from "./texto";
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

export const NOME = "Equatorial";

const FAIXAS_S = faixasDeArea(EQT_TABELA_25.linhas, (l) => l.area_util_m2, (l) => l.demanda_S_kVA);
export const MULTIPLICADOR = lerDoTrecho(EQT_NT00004_TRECHOS, "6.11.4.2", /D = \(D1\) x ([\d,]+) \+ D2 \+ D3 \(2\)/);
export const FORMULA_AREA = lerDoTrecho(EQT_NT00004_TRECHOS, "6.11.4.2", /Y = ([\d,]+) X\^([\d,]+)/);

/** S sugerido (kVA): Tabela 25; acima dela, a fórmula. */
export function sSugerido(areaM2: number): { valor: number | null; referencia: string } {
  if (areaM2 > limiteDaTabela(FAIXAS_S)) {
    const [c, e] = FORMULA_AREA.valores;
    return { valor: formulaDaArea(c, e, areaM2), referencia: FORMULA_AREA.referencia };
  }
  return { valor: valorDaArea(FAIXAS_S, areaM2), referencia: referenciaDe(EQT_TABELA_25) };
}

export function fSugerido(totalApartamentos: number): number | null {
  return EQT_TABELA_26.linhas.find((l) => l.n_aptos === totalApartamentos)?.f_div ?? null;
}

export type OpcoesEquatorial = { apartHotel?: boolean };

export function demandaAreaUtil(tipos: readonly TipoApartamento[], ajustes?: Ajustes, opcoes?: OpcoesEquatorial): ResultadoAreaUtil {
  const area = areaMediaPonderada(tipos);
  const n = totalDeApartamentos(tipos);
  const sug = sSugerido(area);
  const s = fator("s", "Demanda por apartamento", sug.valor, sug.referencia, ajustes, { simbolo: "S", unidade: "kVA" });
  const f = fator("f", "Fator de diversificação", fSugerido(n), referenciaDe(EQT_TABELA_26), ajustes, { simbolo: "f" });
  const m = fator("multiplicador", "Multiplicador", MULTIPLICADOR.valores[0], MULTIPLICADOR.referencia, ajustes);
  const d1 = produto([s.adotado, f.adotado]);
  const fatores = [s, f, m];
  return {
    fatores,
    passos: [
      { chave: "area", rotulo: "Área média ponderada", valor: area, unidade: "m²", formula: "Σ (n · A) ÷ Σ n" },
      { chave: "d1", rotulo: "Demanda dos apartamentos", simbolo: "D1", valor: d1, unidade: "kVA", formula: "S × f" },
      { chave: "d1m", rotulo: "Demanda dos apartamentos com multiplicador", valor: produto([d1, m.adotado]), unidade: "kVA", formula: "D1 × multiplicador" },
    ],
    demandaKVA: produto([d1, m.adotado]),
    demandaCriterioKVA: produto([s.sugerido, f.sugerido, m.sugerido]),
    avisos: [
      ...(opcoes?.apartHotel ? [MSG.apartHotelAreaUtil()] : []),
      ...avisosDeFaltantes(fatores),
      ...avisosAbaixoDaNorma(fatores, NOME),
    ],
  };
}
