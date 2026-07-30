import { z } from "zod";

const id = z.string().min(1);

export const categoriaSchema = z.object({
  codigo: z.string().min(1, "Informe o código."),
  nome: z.string().min(1, "Informe o nome."),
  tipo: z.enum(["receita", "despesa"]),
  paiId: z.string().optional(),
});
export const categoriaEditSchema = categoriaSchema.extend({ id });

export const centroSchema = z.object({ nome: z.string().min(1) });
export const centroEditSchema = centroSchema.extend({ id });

export const contaBancariaSchema = z.object({
  nome: z.string().min(1, "Informe o nome."),
  tipo: z.enum(["corrente", "poupanca", "caixa", "investimento"]),
  banco: z.string().optional(),
  agencia: z.string().optional(),
  numero: z.string().optional(),
  saldoInicial: z.number().default(0),
  padrao: z.boolean().default(false),
});
export const contaBancariaEditSchema = contaBancariaSchema.extend({ id });

export const formaPagamentoSchema = z.object({ nome: z.string().min(1) });
export const formaPagamentoEditSchema = formaPagamentoSchema.extend({ id });

export const fornecedorSchema = z.object({
  tipo: z.enum(["PF", "PJ"]),
  nome: z.string().min(1, "Informe o nome."),
  documento: z.string().optional(),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  telefone: z.string().optional(),
  servico: z.string().optional(),
  observacoes: z.string().optional(),
});
export const fornecedorEditSchema = fornecedorSchema.extend({ id });

export const socioSchema = z.object({
  userId: id,
  percentual: z.number().min(0).max(100),
});
export const socioEditSchema = z.object({ id, percentual: z.number().min(0).max(100) });

export const idSchema = z.object({ id });
export const toggleSchema = z.object({ id, ativo: z.boolean() });
