import { z } from "zod";

/** Mapeamento campo→índice de coluna (números não-negativos) — mesma forma do financeiro. */
export const mapeamentoCrmSchema = z.record(z.string(), z.number().int().nonnegative());

export const validarImportCrmSchema = z.object({
  caminho: z.string().min(1),
  nomeArquivo: z.string().min(1),
  mapeamento: mapeamentoCrmSchema,
});

export const commitImportCrmSchema = validarImportCrmSchema.extend({
  /** Campanha atribuída a toda prospecção NOVA do arquivo — `null`/ausente = sem campanha. */
  campanhaId: z.string().min(1).nullish(),
});
