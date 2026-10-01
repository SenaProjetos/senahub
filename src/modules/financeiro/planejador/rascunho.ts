/**
 * Rascunho da simulação guardado na sessão do navegador (spec §10: a simulação vive na tela, não no
 * banco). Puro: valida o que voltar do `sessionStorage` — texto mexido à mão ou de uma versão
 * antiga vira "sem rascunho", nunca um estado quebrado.
 */
import { z } from "zod";
import { EIXOS_PADRAO, type Eixos } from "@/modules/financeiro/liquidez/cenario";
import { ajusteSchema, type AjusteSimulado } from "@/modules/financeiro/liquidez/ajustes";

export const CHAVE_RASCUNHO = "senahub:planejador-caixa:rascunho:v1";

const rascunhoSchema = z.object({
  eixos: z.object({
    entradas: z.enum(["confirmadas", "provaveis", "estimadas", "todas"]),
    compromissos: z.enum(["todos", "p1p2", "p1"]),
  }),
  ajustes: z.array(ajusteSchema).max(500),
});

export type Rascunho = { eixos: Eixos; ajustes: AjusteSimulado[] };

export const RASCUNHO_VAZIO: Rascunho = { eixos: EIXOS_PADRAO, ajustes: [] };

/** Texto do `sessionStorage` → rascunho válido, ou `null` (nada guardado ou inválido). */
export function lerRascunho(texto: string | null | undefined): Rascunho | null {
  if (!texto) return null;
  try {
    const r = rascunhoSchema.safeParse(JSON.parse(texto));
    return r.success ? (r.data as Rascunho) : null;
  } catch {
    return null;
  }
}

export function escreverRascunho(r: Rascunho): string {
  return JSON.stringify(r);
}
