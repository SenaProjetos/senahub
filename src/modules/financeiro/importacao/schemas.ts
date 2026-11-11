import { z } from "zod";

/** Mapeamento campo→índice de coluna (números não-negativos). */
export const mapeamentoSchema = z.record(z.string(), z.number().int().nonnegative());

export const validarImportSchema = z.object({
  caminho: z.string().min(1),
  nomeArquivo: z.string().min(1),
  mapeamento: mapeamentoSchema,
  /** Modo estrito = false (padrão): categoria, conta, forma e centro desconhecidos são erro na linha. */
  criarCadastros: z.boolean().default(false),
});

export const commitImportSchema = validarImportSchema;

export const desfazerImportSchema = z.object({ loteId: z.string().min(1) });
