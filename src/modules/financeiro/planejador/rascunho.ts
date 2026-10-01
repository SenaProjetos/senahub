/**
 * Rascunho da simulação guardado na sessão do navegador (spec §10: a simulação vive na tela, não no
 * banco). Puro: valida o que voltar do `sessionStorage` — texto mexido à mão ou de uma versão
 * antiga vira "sem rascunho", nunca um estado quebrado.
 */
import { z } from "zod";
import { EIXOS_PADRAO, type Eixos } from "@/modules/financeiro/liquidez/cenario";
import type { AjusteSimulado } from "@/modules/financeiro/liquidez/simulacao";

export const CHAVE_RASCUNHO = "senahub:planejador-caixa:rascunho:v1";

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const prioridade = z.enum(["p1", "p2", "p3", "p4"]);
const confianca = z.enum(["confirmada_cliente", "provavel", "estimada", "incerta"]);

const ajuste = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("REPROGRAMAR_DATA"), eventoId: z.string().min(1), data }),
  z.object({ tipo: z.literal("ALTERAR_PRIORIDADE"), eventoId: z.string().min(1), prioridade }),
  z.object({ tipo: z.literal("ALTERAR_CONFIANCA"), eventoId: z.string().min(1), confianca }),
  z.object({ tipo: z.literal("EXCLUIR"), eventoId: z.string().min(1) }),
  z.object({ tipo: z.literal("FORCAR_INCLUSAO"), eventoId: z.string().min(1) }),
  z.object({
    tipo: z.literal("INCLUIR"),
    id: z.string().min(1),
    movimento: z.object({
      tipo: z.enum(["receita", "despesa"]),
      natureza: z.enum(["resultado", "fora_do_resultado", "transferencia"]),
      valor: z.number().int().positive(),
      data,
      descricao: z.string().min(1).max(200),
    }),
  }),
]);

const rascunhoSchema = z.object({
  eixos: z.object({
    entradas: z.enum(["confirmadas", "provaveis", "estimadas", "todas"]),
    compromissos: z.enum(["todos", "p1p2", "p1"]),
  }),
  ajustes: z.array(ajuste).max(500),
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
