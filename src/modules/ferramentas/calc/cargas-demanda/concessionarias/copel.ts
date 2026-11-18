/**
 * Copel — fatores de demanda da NTC 841001, anexo 7 (FD por tipo de carga) — **puro**.
 * Decisão do engenheiro (2026-11-12, Q24): a NTC 900600 NÃO é usada. A Copel vai sempre pelo método da carga
 * instalada (como a Enel) e o atendimento fica a cargo do projetista verificar na norma. Por isso não há método de
 * área útil, fator multiplicador, FD do condomínio do 3.2 nem tabelas de motores da 900600 aqui.
 * Todas as constantes são lidas da biblioteca.
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
} from "../biblioteca/copel";
import { referenciaDe } from "../biblioteca/tipos";
import { valorDaFaixa } from "../fd";
import { contagemDoRotulo, fdDaFaixa, maiorEDemais, type FdMaiorEDemais, type FdProgressivo, type FdSugerido, type PotenciaMotor } from "./fd-sugerido";
import { lerDaNota } from "./texto";

export const NOME = "Copel";

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
