/**
 * Neoenergia — método da área útil da DIS-NOR-053, Anexo I (anexo A da spec) — **puro**.
 *   Dr  = Σ (Dapto do tipo × nº de aptos)         (Dapto: Quadro 35, por tipo; sem média)
 *   Dtr = Dr × Fc                                  (Fc: Quadro 36, pelo nº TOTAL de apartamentos do nível; studio > 15 un = 90%)
 *   Drf = Dtr × Fr                                 (Fr: Quadro 37, pela Dtr)
 * Área acima do Quadro 35: sem fórmula na norma, "consultar a concessionária" (spec §4.2) — o fator fica sem sugestão.
 */

import { NEO_QUADRO_35, NEO_QUADRO_36, NEO_QUADRO_37, NEO_STUDIO, NEO_TABELA_7 } from "../biblioteca/neoenergia";
import { referenciaDe } from "../biblioteca/tipos";
import { valorDaFaixa } from "../fd";
import { avisosDeFaltantes, fatoresPorTipo, valorDaArea } from "./area";
import { avisosAbaixoDaNorma, fator, produto, totalDeApartamentos, type Ajustes, type ResultadoAreaUtil, type TipoApartamento } from "./tipos";

export const NOME = "Neoenergia";

export type OpcoesNeoenergia = { studio?: boolean };

/** Fc sugerido (fração), pelo nº total de apartamentos. */
export function fcSugerido(totalApartamentos: number, opcoes?: OpcoesNeoenergia): number | null {
  if (opcoes?.studio && totalApartamentos > NEO_STUDIO.acimaDeUnidades) return NEO_STUDIO.fcPercent / 100;
  const pct = valorDaFaixa(NEO_QUADRO_36.linhas, totalApartamentos);
  return pct == null ? null : pct / 100;
}

export function frSugerido(dtrKVA: number): number | null {
  return valorDaFaixa(NEO_QUADRO_37.linhas, dtrKVA);
}

/**
 * FD de chuveiros, torneiras, aquecedores de passagem e ferros (DIS-NOR-030, Tabela 7), pelo nº de aparelhos do
 * ESCOPO somados entre si (nota da tabela).
 */
export function fdAquecimento(aparelhosNoEscopo: number): { fd: number | null; referencia: string } {
  return { fd: valorDaFaixa(NEO_TABELA_7.linhas, aparelhosNoEscopo), referencia: referenciaDe(NEO_TABELA_7) };
}

export function demandaAreaUtil(tipos: readonly TipoApartamento[], ajustes?: Ajustes, opcoes?: OpcoesNeoenergia): ResultadoAreaUtil {
  const n = totalDeApartamentos(tipos);
  const daptos = fatoresPorTipo(
    tipos,
    "dapto",
    (t) => `Demanda por apartamento (${t.nome})`,
    (t) => ({ valor: valorDaArea(NEO_QUADRO_35.linhas, t.areaUtilM2), referencia: referenciaDe(NEO_QUADRO_35) }),
    ajustes,
    { simbolo: "Dapto", unidade: "kVA" },
  );
  const fc = fator("fc", "Fator de coincidência", fcSugerido(n, opcoes), referenciaDe(NEO_QUADRO_36), ajustes, { simbolo: "Fc" });

  const soma = (usar: "adotado" | "sugerido") =>
    daptos.some((d) => d[usar] == null) ? null : daptos.reduce((s, d, i) => s + (d[usar] as number) * tipos[i].quantidade, 0);
  const dr = soma("adotado");
  const dtr = produto([dr, fc.adotado]);
  const fr = fator("fr", "Fator de segurança", dtr == null ? null : frSugerido(dtr), referenciaDe(NEO_QUADRO_37), ajustes, {
    simbolo: "Fr",
  });
  const drf = produto([dtr, fr.adotado]);

  const dtrCriterio = produto([soma("sugerido"), fc.sugerido]);
  const drfCriterio = dtrCriterio == null ? null : produto([dtrCriterio, frSugerido(dtrCriterio)]);

  const fatores = [...daptos, fc, fr];
  return {
    fatores,
    passos: [
      { chave: "dr", rotulo: "Demanda dos apartamentos", simbolo: "Dr", valor: dr, unidade: "kVA", formula: "Σ (Dapto × nº de apartamentos)" },
      { chave: "dtr", rotulo: "Demanda com coincidência", simbolo: "Dtr", valor: dtr, unidade: "kVA", formula: "Dr × Fc" },
      { chave: "drf", rotulo: "Demanda residencial", simbolo: "Drf", valor: drf, unidade: "kVA", formula: "Dtr × Fr" },
    ],
    demandaKVA: drf,
    demandaCriterioKVA: drfCriterio,
    avisos: [...avisosDeFaltantes(fatores), ...avisosAbaixoDaNorma(fatores, NOME)],
  };
}
