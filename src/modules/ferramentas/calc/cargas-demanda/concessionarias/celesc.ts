/**
 * Celesc — empreendimento residencial da N-321.0003, 5.6.2 (anexo D da spec) — **puro**.
 *   DP = k · (D1 + D2) + De + Ds;   D1 = F · Da
 *   F: Tabela 01 pelo nº de apartamentos; Da: Tabela 02 pela área média ponderada (por m²; "ATÉ 70 m²" = 1,57);
 *   acima de 400 m², Da = 0,034939 · A^0,895075 (constantes do 5.6.2 na biblioteca).
 * O k vale para apartamentos E condomínio: aqui entra em `demandaKVA` (k · D1) e volta em `fatorDoConjunto` para a
 * composição do nível aplicá-lo também ao D2.
 */

import {
  CELESC_562,
  CELESC_TABELA_01,
  CELESC_TABELA_02,
  CELESC_TABELA_04,
  CELESC_TABELA_05,
  CELESC_TABELA_06,
  CELESC_TABELA_07,
  N_321_0003,
} from "../biblioteca/celesc";
import { referenciaDe } from "../biblioteca/tipos";
import type { Degrau } from "../fd";
import { avisosDeFaltantes, formulaDaArea, valorDaArea } from "./area";
import { fdDaFaixa, type FdProgressivo, type FdSugerido } from "./fd-sugerido";
import { lerDaNota } from "./texto";
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

/** k do 5.6.2, que vale para apartamentos e condomínio: DP = k · (D1 + D2) + De + Ds. */
export function fatorDoConjunto(ajustes?: Ajustes): FatorDoMetodo {
  return fator("k", "Fator de majoração", CELESC_562.k, REF_562, ajustes, { simbolo: "k" });
}

export function demandaAreaUtil(tipos: readonly TipoApartamento[], ajustes?: Ajustes): ResultadoAreaUtil {
  const area = areaMediaPonderada(tipos);
  const sug = daSugerido(area);
  const da = fator("da", "Demanda por apartamento", sug.valor, sug.referencia, ajustes, { simbolo: "Da", unidade: "kVA" });
  const f = fator("f", "Fator de diversidade", fSugerido(totalDeApartamentos(tipos)), referenciaDe(CELESC_TABELA_01), ajustes, {
    simbolo: "F",
  });
  const k = fatorDoConjunto(ajustes);
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

// ─── FD sugerido por tipo de carga (N-321.0003, 5.6.2 e Tabelas 04 a 07; passo 4b) ──────────────────────────────────

/** 5.6.2 — FD do condomínio: iluminação em degraus de kW, tomadas e cargas especiais; FP 0,90 em iluminação e tomadas. */
export function fdCondominio(): {
  iluminacao: readonly Degrau[];
  iluminacaoFp: number;
  tomadasFd: number;
  tomadasFp: number;
  especiaisFd: number;
  referencia: string;
} {
  return {
    iluminacao: CELESC_562.iluminacaoDegraus,
    iluminacaoFp: CELESC_562.iluminacaoFp,
    tomadasFd: CELESC_562.tomadasFd,
    tomadasFp: CELESC_562.tomadasFp,
    especiaisFd: CELESC_562.especiaisFd,
    referencia: REF_562,
  };
}

/** Células da Tabela 04 que o gerador marcou como destoantes (ligação|cv|motores): ficam sem sugestão. */
const MOTORES_PENDENTES = new Set(["trifasico|15|4", "trifasico|25|10", "trifasico|10|7", "monofasico|3/4|3", "monofasico|3/4|4"]);

export type LigacaoMotorCelesc = "monofasico" | "trifasico";

/** Rótulos da potência (cv) da Tabela 04, como a norma os escreve ("1/3", "1,5", "12,5"). */
export function potenciasDosMotores(ligacao: LigacaoMotorCelesc): string[] {
  return (ligacao === "monofasico" ? CELESC_TABELA_04.monofasicos : CELESC_TABELA_04.trifasicos).map((l) => l.rotulo);
}

/**
 * Tabela 04 — demanda (kVA) do grupo de `quantidade` motores iguais (1 a 10) de uma potência. `null` = potência ou
 * quantidade fora da tabela, ou célula que destoa.
 */
export function demandaMotoresKVA(ligacao: LigacaoMotorCelesc, cv: string, quantidade: number): { kVA: number | null; referencia: string } {
  const referencia = referenciaDe(CELESC_TABELA_04);
  const linhas = ligacao === "monofasico" ? CELESC_TABELA_04.monofasicos : CELESC_TABELA_04.trifasicos;
  const l = linhas.find((x) => x.rotulo === cv);
  if (!l || !Number.isInteger(quantidade) || MOTORES_PENDENTES.has(`${ligacao}|${cv}|${quantidade}`)) return { kVA: null, referencia };
  return { kVA: l.kva[quantidade - 1] ?? null, referencia };
}

/** Tabela 05 — usos de iluminação e tomadas de uso geral (como a norma os escreve). */
export function usosIluminacaoTomadas(): string[] {
  return CELESC_TABELA_05.linhas.map((l) => l.uso);
}

/** Tabela 05 — FD de iluminação e tomadas de uso geral por uso, em degraus de kW. `null` = uso fora da tabela. */
export function fdIluminacaoTomadasUso(uso: string): FdProgressivo | null {
  const l = CELESC_TABELA_05.linhas.find((x) => x.uso === uso);
  return l ? { degraus: l.degraus, literal: l.literal, referencia: referenciaDe(CELESC_TABELA_05) } : null;
}

/** Tabela 06 — aparelhos de aquecimento, pelo nº de aparelhos de cada tipo, individualmente (nota 2). Hotel: o projetista define (nota 3). */
export function fdAquecimento(aparelhosDoTipo: number): FdSugerido {
  return fdDaFaixa(CELESC_TABELA_06, CELESC_TABELA_06.linhas, aparelhosDoTipo);
}

const FD_AR_CENTRAL = lerDaNota(CELESC_TABELA_07.notas, /unidade central de ar condicionado, .*igual a ([\d,]+)%/) / 100;

/** Tabela 07 — ar condicionado pelo nº de aparelhos; unidade central, órgão público ou única empresa: 100% (nota 2). FP 0,90 (nota 3). */
export function fdArCondicionado(central: boolean, aparelhos: number): FdSugerido {
  if (central) return { fd: FD_AR_CENTRAL, referencia: `${referenciaDe(CELESC_TABELA_07)}, nota 2` };
  return fdDaFaixa(CELESC_TABELA_07, CELESC_TABELA_07.linhas, aparelhos);
}
