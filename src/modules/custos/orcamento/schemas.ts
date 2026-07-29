import { z } from "zod";

export const criarItemSchema = z.object({
  orcamentoId: z.string().min(1),
  parentId: z.string().nullable().optional(),
  tipo: z.enum(["grupo", "servico"]),
  descricao: z.string().min(1, "Descrição é obrigatória."),
  unidade: z.string().optional().or(z.literal("")),
  quantidade: z.number().min(0, "Quantidade não pode ser negativa.").optional(),
  custoUnitario: z.number().min(0, "Custo não pode ser negativo.").optional(),
});

export const editarItemSchema = z.object({
  id: z.string().min(1),
  descricao: z.string().min(1, "Descrição é obrigatória.").optional(),
  unidade: z.string().nullable().optional(),
  quantidade: z.number().min(0, "Quantidade não pode ser negativa.").optional(),
  custoUnitario: z.number().min(0, "Custo não pode ser negativo.").optional(),
  bdiPercentual: z
    .number()
    .min(0, "BDI não pode ser negativo.")
    .max(100, "BDI não pode passar de 100%.")
    .nullable()
    .optional(),
});

export const moverItemSchema = z.object({
  id: z.string().min(1),
  direcao: z.enum(["cima", "baixo"]),
});

export const idItemSchema = z.object({ id: z.string().min(1) });

export const alternarTravaSchema = z.object({
  id: z.string().min(1),
  bloqueado: z.boolean(),
});

export const vincularComposicaoSchema = z.object({
  itemId: z.string().min(1),
  composicaoId: z.string().min(1),
});

export const definirBasePrecoSchema = z.object({
  orcamentoId: z.string().min(1),
  basePrecoId: z.string().min(1),
});

export const trocarBaseSchema = z.object({
  orcamentoId: z.string().min(1),
  basePrecoNovaId: z.string().min(1),
});

export const duplicarOrcamentoSchema = z.object({
  orcamentoId: z.string().min(1),
  titulo: z.string().min(1, "Título da cópia é obrigatório."),
});
