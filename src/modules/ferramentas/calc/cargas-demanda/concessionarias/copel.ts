/**
 * Copel — critério da NTC 900600 (anexo E da spec) e fatores de demanda da NTC 841001, anexo 7 — **puro**.
 *   D1 = a × f     (a: Tabela 1 pela área média ponderada "a considerar" — 111,4 m² → 111 m², item 5.2;
 *                   f: Tabela 2 pelo nº de apartamentos, até 300; acima de 400 m², Y = 0,034939 · X^0,895075, 3.1.1)
 *   DT = (D1 + D2) × fator multiplicador   (4.2: 1,2 para o projetista; o exemplo do item 5 usa 1,0)
 *   D2 (condomínio, 3.2): iluminação 100% nos 10 kW iniciais e 25% acima; tomadas 20%; motores pela Tabela 3
 *   (diversidade 1,0 por grupo, reservas fora); demais cargas pelo FD do uso, com o FP do projeto.
 * Todas as constantes de texto são lidas dos trechos da biblioteca.
 *
 * Células da pergunta 11 do plano NÃO são usadas até a decisão do dono: Tabela 1 área 332 m² ("631"), a linha de área
 * em branco da Tabela 1 e a Tabela 3b 1/3 CV com 1 motor ("0377"). Nessas, o valor sai sem sugestão.
 */

import {
  COPEL_NTC841001_TABELA_04,
  COPEL_NTC841001_TABELA_05,
  COPEL_NTC841001_TABELA_06,
  COPEL_NTC841001_TABELA_07,
  COPEL_NTC841001_TABELA_08,
  COPEL_NTC841001_TABELA_09,
  COPEL_NTC841001_TABELA_10,
  COPEL_NTC841001_TABELA_11,
  COPEL_NTC841001_TABELA_12,
  COPEL_NTC900600_TABELA_1,
  COPEL_NTC900600_TABELA_2,
  COPEL_NTC900600_TABELA_3A,
  COPEL_NTC900600_TABELA_3B,
  COPEL_NTC900600_TRECHOS,
} from "../biblioteca/copel";
import { referenciaDe } from "../biblioteca/tipos";
import { aplicarProgressivo, valorDaFaixa, type Degrau } from "../fd";
import { avisosDeFaltantes, formulaDaArea } from "./area";
import { contagemDoRotulo, fdDaFaixa, maiorEDemais, type FdMaiorEDemais, type FdProgressivo, type FdSugerido, type PotenciaMotor } from "./fd-sugerido";
import { lerDaNota, lerDoTrecho } from "./texto";
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

export const NOME = "Copel";

export const FORMULA_AREA = lerDoTrecho(COPEL_NTC900600_TRECHOS, "3.1.1", /Y = ([\d,]+) \. X\^([\d,]+)/);
export const AREA_MINIMA = lerDoTrecho(COPEL_NTC900600_TRECHOS, "3.1.1", /área útil a partir de (\d+) m2/);
export const MULTIPLICADOR = lerDoTrecho(COPEL_NTC900600_TRECHOS, "4.2", /fator multiplicador da demanda total calculada igual a ([\d,]+)\./);
const ILUMINACAO = lerDoTrecho(COPEL_NTC900600_TRECHOS, "3.2.1", /(\d+)% para os primeiros (\d+) kW - (\d+)% para o que exceder/);
const TOMADAS = lerDoTrecho(COPEL_NTC900600_TRECHOS, "3.2.2", /percentualk? (\d+)%/);
/** Degraus da iluminação do condomínio (3.2.1). */
export const DEGRAUS_ILUMINACAO: readonly Degrau[] = [
  { largura: ILUMINACAO.valores[1], fd: ILUMINACAO.valores[0] / 100 },
  { largura: null, fd: ILUMINACAO.valores[2] / 100 },
];
/** FD das tomadas do condomínio (3.2.2). */
export const FD_TOMADAS = TOMADAS.valores[0] / 100;

/** Células da pergunta 11 (não usar até a decisão do dono). */
const AREAS_PENDENTES = new Set([332]);

const linhasT1 = COPEL_NTC900600_TABELA_1.linhas.filter((l): l is typeof l & { "Área (m2)": number } => l["Área (m2)"] != null);
const AREA_MAXIMA_T1 = Math.max(...linhasT1.map((l) => l["Área (m2)"]));

/** Área "a considerar" na Tabela 1: a média arredondada ao m² inteiro (5.2: 111,4 m² → 111 m²). */
export function areaAConsiderar(areaM2: number): number {
  return Math.round(areaM2);
}

/** a sugerido (kVA). Abaixo de 20 m² ou em célula pendente: `null`. Acima da Tabela 1: a fórmula do 3.1.1. */
export function aSugerido(areaM2: number): { valor: number | null; referencia: string } {
  const x = areaAConsiderar(areaM2);
  if (x > AREA_MAXIMA_T1) {
    const [c, e] = FORMULA_AREA.valores;
    return { valor: formulaDaArea(c, e, areaM2), referencia: FORMULA_AREA.referencia };
  }
  const ref = referenciaDe(COPEL_NTC900600_TABELA_1);
  if (x < AREA_MINIMA.valores[0] || AREAS_PENDENTES.has(x)) return { valor: null, referencia: ref };
  return { valor: linhasT1.find((l) => l["Área (m2)"] === x)?.kVA ?? null, referencia: ref };
}

export function fSugerido(apartamentos: number): number | null {
  return COPEL_NTC900600_TABELA_2.linhas.find((l) => l["Nº Aptos"] === apartamentos)?.["F. Div"] ?? null;
}

/** Fator multiplicador do 4.2, que vale para a demanda total (apartamentos e condomínio). */
export function fatorDoConjunto(ajustes?: Ajustes): FatorDoMetodo {
  return fator("multiplicador", "Fator multiplicador", MULTIPLICADOR.valores[0], MULTIPLICADOR.referencia, ajustes);
}

export function demandaAreaUtil(tipos: readonly TipoApartamento[], ajustes?: Ajustes): ResultadoAreaUtil {
  const area = areaMediaPonderada(tipos);
  const sug = aSugerido(area);
  const a = fator("a", "Demanda por apartamento", sug.valor, sug.referencia, ajustes, { simbolo: "a", unidade: "kVA" });
  const f = fator("f", "Diversidade", fSugerido(totalDeApartamentos(tipos)), referenciaDe(COPEL_NTC900600_TABELA_2), ajustes, {
    simbolo: "f",
  });
  const fm = fatorDoConjunto(ajustes);
  const d1 = produto([a.adotado, f.adotado]);
  const fatores = [a, f, fm];
  return {
    fatores,
    passos: [
      { chave: "area", rotulo: "Área média ponderada", valor: area, unidade: "m²", formula: "Σ (n · A) ÷ Σ n" },
      { chave: "area_considerar", rotulo: "Área a considerar", valor: areaAConsiderar(area), unidade: "m²" },
      { chave: "d1", rotulo: "Demanda dos apartamentos", simbolo: "D1", valor: d1, unidade: "kVA", formula: "a × f" },
      { chave: "d1m", rotulo: "Demanda dos apartamentos com o fator multiplicador", valor: produto([d1, fm.adotado]), unidade: "kVA" },
    ],
    demandaKVA: produto([d1, fm.adotado]),
    demandaCriterioKVA: produto([a.sugerido, f.sugerido, fm.sugerido]),
    fatorDoConjunto: fm,
    avisos: [...avisosDeFaltantes(fatores), ...avisosAbaixoDaNorma(fatores, NOME)],
  };
}

// ─── Condomínio (NTC 900600, 3.2) ────────────────────────────────────────────────────────────────────────────────

/** 3.2.1 — iluminação: degraus sobre a carga total (kW) e o FP do projeto. kVA. */
export function iluminacaoCondominioKVA(cargaKW: number, fp: number): number {
  return aplicarProgressivo(cargaKW, DEGRAUS_ILUMINACAO).demanda / fp;
}

/** 3.2.2 — tomadas: FD sobre a carga total (kW) e o FP do projeto. kVA. */
export function tomadasCondominioKVA(cargaKW: number, fp: number): number {
  return (cargaKW * FD_TOMADAS) / fp;
}

export type LigacaoMotor = "trifasico" | "monofasico";

/** Potências (cv, como a Tabela 3 escreve) disponíveis para a ligação. */
export function potenciasDaTabela3(ligacao: LigacaoMotor): string[] {
  const t = ligacao === "trifasico" ? COPEL_NTC900600_TABELA_3A : COPEL_NTC900600_TABELA_3B;
  return t.linhas.map((l) => l["Potência do motor (CV)"]);
}

/** Células da Tabela 3 da pergunta 11 (ligação, cv, nº de motores). */
const CELULAS_PENDENTES_T3 = new Set(["monofasico|1/3|1"]);

/**
 * 3.2.3 e 3.2.4 a — motores pela Tabela 3: kVA do grupo de `quantidade` motores iguais, sem os de reserva (5.1).
 * `null` = potência ou quantidade fora da tabela, ou célula pendente.
 */
export function motoresTabela3KVA(m: { ligacao: LigacaoMotor; cv: string; quantidade: number; reserva?: number }): {
  kva: number | null;
  emOperacao: number;
  referencia: string;
} {
  const t = m.ligacao === "trifasico" ? COPEL_NTC900600_TABELA_3A : COPEL_NTC900600_TABELA_3B;
  const emOperacao = m.quantidade - (m.reserva ?? 0);
  const linha = t.linhas.find((l) => l["Potência do motor (CV)"] === m.cv);
  const pendente = CELULAS_PENDENTES_T3.has(`${m.ligacao}|${m.cv}|${emOperacao}`);
  const bruto = linha && !pendente ? (linha as Readonly<Record<string, unknown>>)[String(emOperacao)] : null;
  return { kva: typeof bruto === "number" ? bruto : null, emOperacao, referencia: referenciaDe(t) };
}

// ─── Ar-condicionado (NTC 841001, anexo 7, Tabela 04) ────────────────────────────────────────────────────────────

const FD_AR_CENTRAL = lerDaNota(COPEL_NTC841001_TABELA_04.notas, /unidade central de condicionamento de ar, .*igual a ([\d,]+)/);
const FD_AR_RESIDENCIAL = lerDaNota(COPEL_NTC841001_TABELA_04.notas, /unidades consumidoras residenciais, .*igual a ([\d,]+)/);

export type UsoArCondicionado = "comercial" | "residencial" | "central";

/** FD do ar-condicionado: tipo janela comercial pela Tabela 04 (nº de aparelhos do escopo); notas 1 e 2 nos demais. */
export function fdArCondicionado(uso: UsoArCondicionado, aparelhos: number): { fd: number | null; referencia: string } {
  const referencia = referenciaDe(COPEL_NTC841001_TABELA_04);
  if (uso === "central") return { fd: FD_AR_CENTRAL, referencia: `${referencia}, nota 1` };
  if (uso === "residencial") return { fd: FD_AR_RESIDENCIAL, referencia: `${referencia}, nota 2` };
  const faixas = COPEL_NTC841001_TABELA_04.linhas.map((l) => ({ de: l.numero_de_aparelhos.de, ate: l.numero_de_aparelhos.ate, valor: l.fd }));
  return { fd: valorDaFaixa(faixas, aparelhos), referencia };
}

// ─── FD sugerido por tipo de carga (NTC 841001, anexo 7, Tabelas 05 a 12; passo 4b) ─────────────────────────────────

/** Tabela 05 — chuveiros, torneiras, aquecedores de água e ferros elétricos, pelo nº de aparelhos de CADA tipo. */
export function fdAquecimento(aparelhosDoTipo: number): FdSugerido {
  const faixas = COPEL_NTC841001_TABELA_05.linhas.map((l) => ({ de: l.numero_de_aparelhos.de, ate: l.numero_de_aparelhos.ate, valor: l.fd }));
  return fdDaFaixa(COPEL_NTC841001_TABELA_05, faixas, aparelhosDoTipo);
}

export type LigacaoMotorCopel = "monofasico" | "trifasico";

/**
 * Tabelas 06 (monofásicos) e 07 (trifásicos) — potência absorvida da rede pela potência nominal em cv ("1/4", "15"):
 * kW da carga instalada e kVA da demanda. As correntes ficam fora (pergunta 12 do plano: 125 cv a 127 V destoa).
 */
export function potenciaMotor(ligacao: LigacaoMotorCopel, cv: string): PotenciaMotor | null {
  const t = ligacao === "monofasico" ? COPEL_NTC841001_TABELA_06 : COPEL_NTC841001_TABELA_07;
  const l = t.linhas.find((x) => x.potencia_nominal_cv === cv);
  return l ? { kW: l.potencia_absorvida_kw_c_inst, kVA: l.potencia_absorvida_kva_demanda, referencia: referenciaDe(t) } : null;
}

type LinhaMaiorEDemais = { equipamento: string; numero_de_aparelhos: string; fator_de_demanda: number };

/** Lê "o primeiro(s) e os restantes" de uma tabela de equipamentos: a linha de contagem (1, "até dois") e a dos "restantes". */
function lerMaiorEDemais(tabela: Parameters<typeof referenciaDe>[0], linhas: readonly LinhaMaiorEDemais[]): FdMaiorEDemais | null {
  const primeira = linhas.find((l) => !/restantes/i.test(l.numero_de_aparelhos));
  const restante = linhas.find((l) => /restantes/i.test(l.numero_de_aparelhos));
  const primeiros = primeira ? contagemDoRotulo(primeira.numero_de_aparelhos) : null;
  if (!primeira || !restante || primeiros == null) return null;
  return maiorEDemais(tabela, primeiros, primeira.fator_de_demanda, restante.fator_de_demanda);
}

/** Tabela 08 — equipamentos especiais (como a norma os escreve: "Aparelho de Raio X", "Máquinas de Solda"). */
export function equipamentosEspeciais(): string[] {
  return [...new Set(COPEL_NTC841001_TABELA_08.linhas.map((l) => l.equipamento))];
}

/** Tabela 08 — o maior e os restantes de um equipamento especial. `null` = equipamento fora da tabela. */
export function fdEquipamentoEspecial(equipamento: string): FdMaiorEDemais | null {
  return lerMaiorEDemais(
    COPEL_NTC841001_TABELA_08,
    COPEL_NTC841001_TABELA_08.linhas.filter((l) => l.equipamento === equipamento),
  );
}

/** Tabela 09 — bomba de água: a 1ª bomba e as restantes. */
export function fdBombaDAgua(): FdMaiorEDemais | null {
  return lerMaiorEDemais(COPEL_NTC841001_TABELA_09, COPEL_NTC841001_TABELA_09.linhas);
}

/** Tabela 10 — elevadores: até dois com 1,00 e os restantes com o outro fator. */
export function fdElevadores(): FdMaiorEDemais | null {
  return lerMaiorEDemais(COPEL_NTC841001_TABELA_10, COPEL_NTC841001_TABELA_10.linhas);
}

/** Tabela 11 — motores, pelo nº TOTAL de motores. */
export function fdMotores(totalMotores: number): FdSugerido {
  const faixas = COPEL_NTC841001_TABELA_11.linhas.map((l) => ({ de: l.numero_total_de_motores.de, ate: l.numero_total_de_motores.ate, valor: l.fator_de_demanda }));
  return fdDaFaixa(COPEL_NTC841001_TABELA_11, faixas, totalMotores);
}

/** Tabela 12 — usos de iluminação (como a norma os escreve). */
export function usosIluminacao(): string[] {
  return COPEL_NTC841001_TABELA_12.linhas.map((l) => l.descricao);
}

/** Tabela 12 — FD de iluminação por uso, em degraus de kW. `null` = uso fora da tabela. */
export function fdIluminacaoUso(uso: string): FdProgressivo | null {
  const l = COPEL_NTC841001_TABELA_12.linhas.find((x) => x.descricao === uso);
  if (!l) return null;
  const degraus = l.faixa_kw == null ? [{ largura: null, fd: l.fator_de_demanda }] : [{ largura: l.faixa_kw, fd: l.fator_de_demanda }, { largura: null, fd: l.fator_de_demanda_excedente ?? l.fator_de_demanda }];
  return { degraus, literal: l.literal, referencia: referenciaDe(COPEL_NTC841001_TABELA_12) };
}
