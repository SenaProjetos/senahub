import { z } from "zod";

/** Pastas personalizadas (admin, qualquer projeto) — ver `modules/projetos/pastas/actions.ts`. */
export const criarPastaPersonalizadaSchema = z.object({
  disciplinaId: z.string().min(1),
  nome: z.string().trim().min(1, "Informe o nome da pasta.").max(80),
  parentId: z.string().min(1).nullable().optional(),
});

export const renomearPastaPersonalizadaSchema = z.object({
  pastaId: z.string().min(1),
  nome: z.string().trim().min(1, "Informe o nome da pasta.").max(80),
});

export const excluirPastaPersonalizadaSchema = z.object({
  pastaId: z.string().min(1),
});

export const moverArquivoDePastaSchema = z.object({
  uploadId: z.string().min(1),
  pastaId: z.string().min(1),
});
