import { z } from "zod";
import { CategoriaInsumo } from "@/generated/prisma/enums";

const id = z.string().min(1);
const categoriaInsumo = z.enum(Object.values(CategoriaInsumo) as [CategoriaInsumo, ...CategoriaInsumo[]]);

export const fornecedorSchema = z.object({
  tipo: z.enum(["PF", "PJ"]),
  nome: z.string().min(1, "Informe o nome."),
  documento: z.string().optional(),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  telefone: z.string().optional(),
  observacoes: z.string().optional(),
  regioesAtendidas: z.array(z.string()).min(1, "Selecione ao menos uma UF."),
  categoriasFornecidas: z.array(categoriaInsumo).min(1, "Selecione ao menos uma categoria."),
  prazoMedioDiasEntrega: z.number().int().min(0).optional(),
  condicoesComerciais: z.string().optional(),
  avaliacaoNota: z.number().min(0).max(5).optional(),
});
export const fornecedorEditSchema = fornecedorSchema.extend({ id });

export const representanteSchema = z.object({
  fornecedorId: id,
  nome: z.string().min(1, "Informe o nome."),
  cargo: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
});

export const idSchema = z.object({ id });
export const toggleSchema = z.object({ id, ativo: z.boolean() });
