/**
 * Serialização e parse do arquivo de salvamento portátil (.shcalc.json).
 * Puro — sem I/O, sem Prisma. Roda tanto no cliente quanto no servidor.
 */

import { z } from "zod";
import { entradaSchema as unitConvertSchema } from "./calc/unit-convert";
import { entradaSchema as sectionSchema } from "./calc/section-properties";
import { entradaSchema as beamFlexureSchema } from "./calc/concrete-beam-flexure";
import { entradaSchema as anchorageSchema } from "./calc/rebar-anchorage";
import { entradaSchema as steelSummarySchema } from "./calc/steel-summary";
import { entradaSchema as pileSptSchema } from "./calc/pile-spt";
import { entradaSchema as loadDescentSchema } from "./calc/load-descent";
import { entradaSchema as windForceSchema } from "./calc/wind-force";
import { entradaSchema as actionCombosSchema } from "./calc/action-combos";
import { entradaSchema as concreteColumnSchema } from "./calc/concrete-column";
import { entradaSchema as slabBaresSchema } from "./calc/slab-bares";
import { entradaSchema as stairSchema } from "./calc/stair";
import { entradaSchema as punchingSchema } from "./calc/punching";
import { entradaSchema as footingSchema } from "./calc/footing";
import { entradaSchema as eccentricFootingSchema } from "./calc/eccentric-footing";

export const SAVEFILE_APP = "senahub" as const;
export const SAVEFILE_KIND = "shcalc" as const;

/** Schema do cabeçalho comum a qualquer ferramenta. */
const headerSchema = z.object({
  app: z.literal(SAVEFILE_APP),
  kind: z.literal(SAVEFILE_KIND),
  ferramenta: z.string().min(1),
  versaoCalc: z.number().int().positive(),
  titulo: z.string().min(1),
  norma: z.string().optional(),
  geradoEm: z.string().datetime(),
});

/** Schemas de entradas por ferramenta (adicionar aqui à medida que novas ferramentas forem criadas). */
const ENTRADAS_SCHEMAS: Record<string, z.ZodTypeAny> = {
  U01: unitConvertSchema,
  U02: sectionSchema,
  E01: beamFlexureSchema,
  E04: concreteColumnSchema,
  E05: slabBaresSchema,
  E07: punchingSchema,
  E08: stairSchema,
  E21: footingSchema,
  E22: eccentricFootingSchema,
  E10: anchorageSchema,
  E11: steelSummarySchema,
  E12: loadDescentSchema,
  E13: windForceSchema,
  E14: actionCombosSchema,
  E23: pileSptSchema,
};

const savefileSchema = headerSchema.extend({
  entradas: z.record(z.string(), z.unknown()),
});

export type ShcalcFile = z.infer<typeof savefileSchema>;

type SerializarInput = {
  ferramenta: string;
  versaoCalc: number;
  titulo: string;
  norma?: string;
  entradas: Record<string, unknown>;
};

/** Serializa um cálculo para o formato .shcalc.json (string JSON). */
export function serializar(input: SerializarInput): string {
  const file: ShcalcFile = {
    app: SAVEFILE_APP,
    kind: SAVEFILE_KIND,
    ferramenta: input.ferramenta,
    versaoCalc: input.versaoCalc,
    titulo: input.titulo,
    norma: input.norma,
    geradoEm: new Date().toISOString(),
    entradas: input.entradas,
  };
  return JSON.stringify(file, null, 2);
}

export type ParseResult =
  | { ok: true; data: ShcalcFile }
  | { ok: false; erro: string };

/**
 * Lê e valida um arquivo .shcalc.json.
 * Valida o header e as entradas usando o schema da ferramenta alvo.
 * Retorna { ok: false, erro } com mensagem amigável em caso de falha.
 */
export function parse(json: string, ferramentaEsperada?: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, erro: "Arquivo inválido: não é um JSON válido." };
  }

  const header = savefileSchema.safeParse(raw);
  if (!header.success) {
    return {
      ok: false,
      erro: "Arquivo inválido: não é um arquivo de salvamento SenaHub (.shcalc).",
    };
  }

  const data = header.data;

  if (ferramentaEsperada && data.ferramenta !== ferramentaEsperada) {
    return {
      ok: false,
      erro: `Este arquivo é de "${data.ferramenta}", não de "${ferramentaEsperada}". Abra-o na ferramenta correta.`,
    };
  }

  const entradasSchema = ENTRADAS_SCHEMAS[data.ferramenta];
  if (entradasSchema) {
    const validacao = entradasSchema.safeParse(data.entradas);
    if (!validacao.success) {
      return {
        ok: false,
        erro: `Entradas incompatíveis com a versão atual da ferramenta "${data.ferramenta}". O arquivo pode ser de uma versão mais antiga.`,
      };
    }
  }

  return { ok: true, data };
}
