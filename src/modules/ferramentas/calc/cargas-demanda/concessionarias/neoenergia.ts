/**
 * Neoenergia — método da área útil da DIS-NOR-053, Anexo I (anexo A da spec) — **puro**.
 *   Dr  = Σ (Dapto do tipo × nº de aptos)         (Dapto: Quadro 35, por tipo; sem média)
 *   Dtr = Dr × Fc                                  (Fc: Quadro 36, pelo nº TOTAL de apartamentos do nível; studio > 15 un = 90%)
 *   Drf = Dtr × Fr                                 (Fr: Quadro 37, pela Dtr)
 * Área acima do Quadro 35: sem fórmula na norma, "consultar a concessionária" (spec §4.2) — o fator fica sem sugestão.
 */

import {
  NEO_QUADRO_35,
  NEO_QUADRO_36,
  NEO_QUADRO_37,
  NEO_STUDIO,
  NEO_TABELA_6,
  NEO_TABELA_7,
  NEO_TABELA_8,
  NEO_TABELA_9,
  NEO_TABELA_10,
  NEO_TABELA_11,
  NEO_TABELA_12,
  NEO_TABELA_13,
  NEO_TABELA_14,
  NEO_TABELA_15,
  NEO_TABELA_16,
  NEO_TABELA_18,
  NEO_TABELA_19,
  NEO_TABELA_22,
} from "../biblioteca/neoenergia";
import { referenciaDe } from "../biblioteca/tipos";
import { valorDaFaixa } from "../fd";
import { avisosDeFaltantes, fatoresPorTipo, valorDaArea } from "./area";
import { fdDaFaixa, maiorEDemais, type FdMaiorEDemais, type FdProgressivo, type FdSugerido, type PotenciaMotor } from "./fd-sugerido";
import { lerDaNota, numeroBr } from "./texto";
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

// ─── FD sugerido por tipo de carga (DIS-NOR-030, Anexo II; passo 4b) ─────────────────────────────────────────────────

/** Tabela 6 — iluminação e tomadas residenciais: FD da faixa da carga instalada (kW) aplicado à carga inteira. */
export function fdTomadasIluminacaoResidencial(cargaKW: number): FdSugerido {
  return fdDaFaixa(NEO_TABELA_6, NEO_TABELA_6.linhas, cargaKW);
}

/** Tabela 8 — aquecedor central ou de acumulação (boiler), pelo nº de aparelhos. */
export function fdAquecedorCentral(aparelhos: number): FdSugerido {
  return fdDaFaixa(NEO_TABELA_8, NEO_TABELA_8.linhas, aparelhos);
}

/** Tabela 9 — secadora, forno elétrico, máquina de lavar roupa, lava-louça e micro-ondas, pelo nº de aparelhos. */
export function fdSecadoraFornoLavadoras(aparelhos: number): FdSugerido {
  return fdDaFaixa(NEO_TABELA_9, NEO_TABELA_9.linhas, aparelhos);
}

/** Tabela 10 — fogões elétricos, pelo nº de aparelhos. */
export function fdFogao(aparelhos: number): FdSugerido {
  return fdDaFaixa(NEO_TABELA_10, NEO_TABELA_10.linhas, aparelhos);
}

const FD_AR_CENTRAL = lerDaNota(NEO_TABELA_12.notas, /unidade central de condicionador de ar, .*igual a ([\d,]+)\./);

export type UsoArCondicionadoNeo = "comercial" | "residencial" | "central";

/** Tabela 12 — condicionadores de ar pelo nº de aparelhos; a unidade central tem FD 1,00 pela nota. */
export function fdArCondicionado(uso: UsoArCondicionadoNeo, aparelhos: number): FdSugerido {
  const referencia = referenciaDe(NEO_TABELA_12);
  if (uso === "central") return { fd: FD_AR_CENTRAL, referencia: `${referencia}, nota` };
  const faixas = NEO_TABELA_12.linhas.map((l) => ({ de: l.de, ate: l.ate, valor: l.valor[uso] }));
  return fdDaFaixa(NEO_TABELA_12, faixas, aparelhos);
}

/** Tabela 13 — estações de recarga individuais, pelo nº de aparelhos. */
export function fdRecargaIndividual(aparelhos: number): FdSugerido {
  return fdDaFaixa(NEO_TABELA_13, NEO_TABELA_13.linhas, aparelhos);
}

/** Tabela 14 — motores: o maior e os demais (nota 1: iguais contam um como o maior; nota 2: partida simultânea soma como um). */
export function fdMotores(): FdMaiorEDemais {
  return maiorEDemais(NEO_TABELA_14, NEO_TABELA_14.primeiros, NEO_TABELA_14.fdPrimeiros, NEO_TABELA_14.fdDemais);
}

/** Tabela 15 — equipamentos especiais: o maior e os demais. */
export function fdEquipamentosEspeciais(): FdMaiorEDemais {
  return maiorEDemais(NEO_TABELA_15, NEO_TABELA_15.primeiros, NEO_TABELA_15.fdPrimeiros, NEO_TABELA_15.fdDemais);
}

/** Tabela 16 — bombas e hidromassagem, pelo nº de aparelhos. */
export function fdBombasHidromassagem(aparelhos: number): FdSugerido {
  return fdDaFaixa(NEO_TABELA_16, NEO_TABELA_16.linhas, aparelhos);
}

/** Tabela 11 — potência do condicionador de ar pela capacidade (BTU/h), sem as correntes. */
export function potenciaArCondicionado(btuh: number): PotenciaMotor | null {
  const l = NEO_TABELA_11.linhas.find((x) => x.btuh === btuh);
  return l ? { kW: l.w == null ? null : l.w / 1000, kVA: l.va == null ? null : l.va / 1000, referencia: referenciaDe(NEO_TABELA_11) } : null;
}

export type LigacaoMotorNeo = "monofasico" | "trifasico";

/** Tabelas 18 (monofásicos) e 19 (trifásicos) — potência absorvida da rede pelo rótulo da potência nominal ("1/2", "1"). */
export function potenciaMotor(ligacao: LigacaoMotorNeo, rotulo: string): PotenciaMotor | null {
  const t = ligacao === "monofasico" ? NEO_TABELA_18 : NEO_TABELA_19;
  const l = t.linhas.find((x) => x.rotulo === rotulo);
  if (!l) return null;
  return { kW: l.w == null ? null : l.w / 1000, kVA: l.va == null ? null : l.va / 1000, referencia: referenciaDe(t) };
}

/** Tabela 22 — usos da tabela de iluminação e tomadas de uso geral (como a norma os escreve). */
export function usosIluminacaoTomadas(): string[] {
  return NEO_TABELA_22.linhas.map((l) => l.uso);
}

/** Tabela 22 — FD de iluminação e tomadas por uso, em degraus de kW (`degraus` nulo: regra só em texto). `null` = uso fora da tabela. */
export function fdIluminacaoTomadasUso(uso: string): FdProgressivo | null {
  const l = NEO_TABELA_22.linhas.find((x) => x.uso === uso);
  return l ? { degraus: l.degraus, literal: l.literal, referencia: referenciaDe(NEO_TABELA_22) } : null;
}

/**
 * Tabela 22, "Administração de edifícios de uso coletivo": a regra é "1,00 da carga de iluminação mais 0,50 da carga de
 * tomadas". Resposta do engenheiro à Q36 (2026-11-12): duas linhas de carga, cada uma com o seu FD, lidos do texto da
 * própria linha.
 */
export function fdAdministracaoEdificios(): { iluminacao: number; tomadas: number; referencia: string } {
  const l = NEO_TABELA_22.linhas.find((x) => x.uso === "Administração de edifícios de uso coletivo");
  const m = /([\d,]+) da carga de iluminação mais ([\d,]+) da carga de tomadas/.exec(l?.literal ?? "");
  if (!m) throw new Error("Tabela 22 da Neoenergia: regra da administração de edifícios não encontrada.");
  return { iluminacao: numeroBr(m[1]), tomadas: numeroBr(m[2]), referencia: referenciaDe(NEO_TABELA_22) };
}
