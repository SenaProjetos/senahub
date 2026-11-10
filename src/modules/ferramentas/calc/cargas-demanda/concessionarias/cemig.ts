/**
 * Cemig — critério da ND-5.2, 7.2 (anexo C da spec) — **puro**.
 *   D1 = 1,4 × f × a     (1,4 lido do texto "D1 = ( 1 , 4 . f . a )"; f: Tabela 12, só acima de 3 apartamentos;
 *                         a: Tabela 13 pela área útil)
 * Áreas diferentes (nota 8): (a) cada conjunto isolado e somado, desde que nenhum tenha menos de 4 apartamentos; ou
 * (b) média ponderada com o f do total. Sem escolha do projetista, usa (a) quando todos os conjuntos têm 4 ou mais.
 * Área acima da Tabela 13: "consultar a Cemig" (nota 2) — sem sugestão.
 *
 * Pergunta 1 do plano (caso 13): `demandaKVA` usa o fator digitado e `demandaCriterioKVA` o da norma.
 */

import {
  CEMIG_ND51_TABELA_11,
  CEMIG_ND51_TABELA_12,
  CEMIG_ND51_TABELA_13,
  CEMIG_ND51_TABELA_14,
  CEMIG_ND51_TABELA_15,
  CEMIG_ND52_TABELA_12,
  CEMIG_ND52_TABELA_13,
  CEMIG_ND52_TRECHOS,
} from "../biblioteca/cemig";
import { referenciaDe } from "../biblioteca/tipos";
import { avisosDeFaltantes, faixasDeArea, fatoresPorTipo, valorDaArea } from "./area";
import { degrausDeFaixasAcumuladas, fdDaFaixa, type FdProgressivo, type FdSugerido } from "./fd-sugerido";
import { lerDoTrecho } from "./texto";
import {
  areaMediaPonderada,
  avisosAbaixoDaNorma,
  fator,
  produto,
  totalDeApartamentos,
  type Ajustes,
  type FatorDoMetodo,
  type ResultadoAreaUtil,
  type TipoApartamento,
} from "./tipos";

export const NOME = "Cemig";

const FAIXAS_A = faixasDeArea(CEMIG_ND52_TABELA_13.linhas, (l) => l.area_util_m2, (l) => l.demanda_kva);
export const MULTIPLICADOR = lerDoTrecho(CEMIG_ND52_TRECHOS, "7.2", /D1 = \( ?([\d ,]+?) ?\. f \. a \)/);

export function aSugerido(areaM2: number): number | null {
  return valorDaArea(FAIXAS_A, areaM2);
}

/**
 * Linhas da Tabela 12 sem a do rótulo impresso errado: a ND-5.2 imprime "228" na posição do 217 (fator 81,69; a
 * ND-5.5 imprime 217). Essa linha tem `obs` e fica fora até o engenheiro decidir (pergunta 2): 228 lê o 228 de
 * verdade (82,17) e 217 sai sem sugestão.
 */
const LINHAS_T12 = CEMIG_ND52_TABELA_12.linhas.filter((l) => !l.obs);

/** f da Tabela 12 (`null` até 3 apartamentos: "válido somente para quantidade superior a 3"). */
export function fSugerido(apartamentos: number): number | null {
  return LINHAS_T12.find((l) => l.n_aptos === apartamentos)?.fator_mult ?? null;
}

export type FormaCemig = "conjunto" | "media";
export type OpcoesCemig = { forma?: FormaCemig };

/**
 * Forma da nota 8: com mais de um tipo, "conjunto" só se todos têm 4 ou mais apartamentos; senão, média ponderada.
 * Um tipo só: as duas formas dão a mesma conta, e fica "media" (fatores "f" e "a").
 */
export function formaDaNota8(tipos: readonly TipoApartamento[], pedida?: FormaCemig): FormaCemig {
  if (pedida === "media" || tipos.length < 2) return "media";
  return tipos.every((t) => t.quantidade >= 4) ? "conjunto" : "media";
}

export function demandaAreaUtil(tipos: readonly TipoApartamento[], ajustes?: Ajustes, opcoes?: OpcoesCemig): ResultadoAreaUtil {
  const forma = formaDaNota8(tipos, opcoes?.forma);
  const m = fator("multiplicador", "Fator de segurança", MULTIPLICADOR.valores[0], MULTIPLICADOR.referencia, ajustes);
  const refA = referenciaDe(CEMIG_ND52_TABELA_13);
  const refF = referenciaDe(CEMIG_ND52_TABELA_12);

  let parciais: FatorDoMetodo[];
  let soma: (usar: "adotado" | "sugerido") => number | null;
  if (forma === "conjunto") {
    const as = fatoresPorTipo(tipos, "a", (t) => `Demanda por apartamento (${t.nome})`, (t) => ({ valor: aSugerido(t.areaUtilM2), referencia: refA }), ajustes, {
      simbolo: "a",
      unidade: "kVA",
    });
    const fs = fatoresPorTipo(tipos, "f", (t) => `Fator de multiplicação (${t.nome})`, (t) => ({ valor: fSugerido(t.quantidade), referencia: refF }), ajustes, {
      simbolo: "f",
    });
    parciais = as.flatMap((a, i) => [fs[i], a]);
    soma = (usar) => {
      const partes = as.map((a, i) => produto([fs[i][usar], a[usar]]));
      return partes.some((p) => p == null) ? null : partes.reduce<number>((s, p) => s + (p as number), 0);
    };
  } else {
    const a = fator("a", "Demanda por apartamento", aSugerido(areaMediaPonderada(tipos)), refA, ajustes, { simbolo: "a", unidade: "kVA" });
    const f = fator("f", "Fator de multiplicação", fSugerido(totalDeApartamentos(tipos)), refF, ajustes, { simbolo: "f" });
    parciais = [f, a];
    soma = (usar) => produto([f[usar], a[usar]]);
  }

  const fatores = [...parciais, m];
  const d1 = produto([soma("adotado"), m.adotado]);
  return {
    fatores,
    passos: [
      { chave: "fa", rotulo: forma === "conjunto" ? "Soma dos conjuntos (f × a)" : "f × a", valor: soma("adotado"), unidade: "kVA" },
      { chave: "d1", rotulo: "Demanda dos apartamentos", simbolo: "D1", valor: d1, unidade: "kVA", formula: "fator de segurança × f × a" },
    ],
    demandaKVA: d1,
    demandaCriterioKVA: produto([soma("sugerido"), m.sugerido]),
    avisos: [...avisosDeFaltantes(fatores), ...avisosAbaixoDaNorma(fatores, NOME)],
  };
}

// ─── FD sugerido por tipo de carga (ND-5.1, item 10 Tabelas; passo 4b) ──────────────────────────────────────────────

/** Tabela 11 — usos não residenciais (como a norma os escreve). */
export function usosNaoResidenciais(): string[] {
  return CEMIG_ND51_TABELA_11.linhas.map((l) => l.descricao);
}

/**
 * Tabela 11 — FD de iluminação e tomadas por uso não residencial, em degraus de kVA. `null` = uso fora da tabela.
 * A Tabela 10 (residencial, FD por faixa da carga instalada) fica fora: a ND-5.1 não diz se a faixa vale para a carga
 * inteira ou por degrau (perguntas novas do plano).
 */
export function fdIluminacaoTomadasNaoResidencial(uso: string): FdProgressivo | null {
  const l = CEMIG_ND51_TABELA_11.linhas.find((x) => x.descricao === uso);
  if (!l) return null;
  const degraus = degrausDeFaixasAcumuladas(
    l.faixas.map((f) => ({ ate: ("ate_kva" in f ? f.ate_kva : null) ?? null, fd: f.fd })),
  );
  return { degraus, literal: l.fator_demanda_rotulo, referencia: referenciaDe(CEMIG_ND51_TABELA_11) };
}

export type PotenciaDoFogao = "ate_3_5kw" | "superior_3_5kw";

/** Tabela 12 — fornos e fogões elétricos, por nº de aparelhos (1 a 12) e potência (até/acima de 3,5 kW). kW = kVA (nota 1). */
export function fdFornosFogoes(potencia: PotenciaDoFogao, aparelhos: number): FdSugerido {
  const l = CEMIG_ND51_TABELA_12.linhas.find((x) => x.numero_aparelhos === aparelhos);
  const fd = l ? (potencia === "ate_3_5kw" ? l.fd_potencia_ate_3_5kw : l.fd_potencia_superior_3_5kw) : null;
  return { fd, referencia: referenciaDe(CEMIG_ND51_TABELA_12) };
}

/** Tabela 13 — aparelhos eletrodomésticos, de aquecimento, de refrigeração e condicionadores de ar, por nº de aparelhos do grupo (nota 1). */
export function fdAparelhos(aparelhosDoGrupo: number): FdSugerido {
  const faixas = CEMIG_ND51_TABELA_13.linhas.map((l) => ({ de: l.numero_aparelhos.de, ate: l.numero_aparelhos.ate, valor: l.fator_demanda_pct / 100 }));
  return fdDaFaixa(CEMIG_ND51_TABELA_13, faixas, aparelhosDoGrupo);
}

export type LigacaoMotorCemig = "monofasico" | "trifasico";

/** Rótulos da potência no eixo (cv) como a norma os escreve ("1/4", "12,5", "75,0"). */
export function potenciasDosMotores(ligacao: LigacaoMotorCemig): string[] {
  return (ligacao === "monofasico" ? CEMIG_ND51_TABELA_14 : CEMIG_ND51_TABELA_15).linhas.map((l) => l.potencia_eixo_cv);
}

/**
 * Tabelas 14 (monofásicos) e 15 (trifásicos) — demanda INDIVIDUAL de cada motor (kVA), pelo nº TOTAL de motores do
 * consumidor (nota 3: monofásicos e trifásicos contados juntos). `null` = potência fora da tabela ou célula "–".
 */
export function demandaIndividualMotorKVA(ligacao: LigacaoMotorCemig, cv: string, totalMotores: number): { kVA: number | null; referencia: string } {
  const t = ligacao === "monofasico" ? CEMIG_ND51_TABELA_14 : CEMIG_ND51_TABELA_15;
  const l = t.linhas.find((x) => x.potencia_eixo_cv === cv);
  const referencia = referenciaDe(t);
  if (!l || !(totalMotores >= 1)) return { kVA: null, referencia };
  const kVA =
    totalMotores === 1 ? l.demanda_1_motor_kva : totalMotores === 2 ? l.demanda_2_motores_kva : totalMotores <= 5 ? l.demanda_3a5_motores_kva : l.demanda_mais_de_5_kva;
  return { kVA, referencia };
}
