import { exigirCamposValidos } from "@/lib/campos/exigir";
import { CAMPOS, type NomeCampo } from "@/lib/campos";
import { ActionError } from "@/lib/action-error";
import { BRIEFING_SCHEMA } from "./briefing-schema";

/** Chave da resposta → campo do catálogo, para os campos do briefing marcados com `formato`. */
export function formatosDoBriefing(): Record<string, NomeCampo> {
  const mapa: Record<string, NomeCampo> = {};
  for (const secao of BRIEFING_SCHEMA) {
    for (const c of secao.campos) if (c.formato) mapa[c.chave] = c.formato;
  }
  return mapa;
}

export type ResultadoFormatoBriefing =
  | { ok: true; respostas: Record<string, unknown> }
  | { ok: false; erro: string; campos: Record<string, string> };

/**
 * Regra de formato do briefing (puro, serve à action interna e à rota pública): só o valor que
 * MUDOU em relação ao já gravado é validado — o inválido antigo continua salvando (D4) — e o que
 * é válido é gravado no formato padrão. Vazio é sempre válido (o briefing é preenchido aos poucos).
 */
export function aplicarFormatosDoBriefing(
  respostas: Record<string, unknown>,
  anteriores: Record<string, unknown> | null | undefined,
): ResultadoFormatoBriefing {
  const mapa = formatosDoBriefing();
  try {
    exigirCamposValidos(respostas, anteriores, mapa);
  } catch (e) {
    if (e instanceof ActionError) {
      return { ok: false, erro: e.message, campos: e.campos ?? {} };
    }
    throw e;
  }
  const saida = { ...respostas };
  for (const [chave, nome] of Object.entries(mapa)) {
    const v = saida[chave];
    if (typeof v === "string" && v.trim() !== "") saida[chave] = CAMPOS[nome].normalizar(v);
  }
  return { ok: true, respostas: saida };
}
