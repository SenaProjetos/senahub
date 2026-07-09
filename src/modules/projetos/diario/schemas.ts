import { z } from "zod";

/** Nova entrada do diário de uma disciplina. `data` = dia a que a entrada se refere. */
export const criarEntradaDiarioSchema = z.object({
  disciplinaId: z.string().min(1),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  texto: z.string().trim().min(1, "Escreva a evolução do dia.").max(5000),
});

export const editarEntradaDiarioSchema = z.object({
  id: z.string().min(1),
  texto: z.string().trim().min(1, "Escreva a evolução do dia.").max(5000),
});

export type CriarEntradaDiario = z.infer<typeof criarEntradaDiarioSchema>;
export type EditarEntradaDiario = z.infer<typeof editarEntradaDiarioSchema>;
