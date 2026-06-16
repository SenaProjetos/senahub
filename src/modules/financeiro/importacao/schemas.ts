import { z } from "zod";

/** Mapeamento campo→índice de coluna (números não-negativos). */
export const mapeamentoSchema = z.record(z.string(), z.number().int().nonnegative());

export const validarImportSchema = z.object({
  caminho: z.string().min(1),
  nomeArquivo: z.string().min(1),
  mapeamento: mapeamentoSchema,
});

export const commitImportSchema = validarImportSchema;

export const desfazerImportSchema = z.object({ loteId: z.string().min(1) });
