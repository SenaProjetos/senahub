import { z } from "zod";

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

export const certidaoSchema = z.object({
  tipoId: z.string().min(1, "Selecione o tipo."),
  descricao: opt(z.string()),
  validade: z.string().min(1, "Informe a validade."),
});

export const editarCertidaoSchema = z.object({
  id: z.string().min(1),
  descricao: opt(z.string()),
  responsavelId: opt(z.string()),
});

export const idSchema = z.object({ id: z.string().min(1) });

export const criarLinkCertidoesSchema = z.object({
  certidaoIds: z.array(z.string()).min(1, "Selecione ao menos uma certidão."),
  expiraEm: z.string().datetime().nullable().optional(),
});

export const criarTipoCertidaoSchema = z.object({
  nome: z.string().min(1, "Informe o nome."),
  obrigatoria: z.boolean().default(false),
});

export const editarTipoCertidaoSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1, "Informe o nome."),
  obrigatoria: z.boolean(),
});

export const atualizarLinkCertidoesSchema = z.object({
  id: z.string().min(1),
  certidaoIds: z.array(z.string()).default([]),
  ativo: z.boolean(),
  expiraEm: z.string().datetime().nullable().optional(),
});
