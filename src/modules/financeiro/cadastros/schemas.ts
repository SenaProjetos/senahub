import { z } from "zod";
import { campo } from "@/lib/campos/zod";

const id = z.string().min(1);

export const categoriaSchema = z.object({
  codigo: z.string().min(1, "Informe o código."),
  nome: z.string().min(1, "Informe o nome."),
  tipo: z.enum(["receita", "despesa"]),
  paiId: z.string().optional(),
});
export const categoriaEditSchema = categoriaSchema.extend({ id });
/** Custo fixo ou variável de uma despesa (ponto de equilíbrio); `null` = herda da categoria mãe. */
export const tipoCustoCategoriaSchema = z.object({ id, tipoCusto: z.enum(["fixo", "variavel"]).nullable() });

export const centroSchema = z.object({ nome: z.string().min(1) });
export const centroEditSchema = centroSchema.extend({ id });

const contaBancariaBase = {
  nome: z.string().min(1, "Informe o nome."),
  tipo: z.enum(["corrente", "poupanca", "caixa", "investimento"]),
  banco: z.string().optional(),
  numero: z.string().optional(),
  saldoInicial: z.number().default(0),
  /** Dia em que o saldo inicial vale (M8); vazio = todo o realizado da conta entra no saldo. */
  saldoInicialEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").optional().or(z.literal("")),
  padrao: z.boolean().default(false),
};
/** Criar é estrito; editar deixa passar a agência inválida já gravada (a action só recusa se mudou). */
export const contaBancariaSchema = z.object({ ...contaBancariaBase, agencia: campo.agencia() });
export const contaBancariaEditSchema = z.object({ id, ...contaBancariaBase, agencia: campo.agencia({ legado: true }) });

export const formaPagamentoSchema = z.object({ nome: z.string().min(1) });
export const formaPagamentoEditSchema = formaPagamentoSchema.extend({ id });

/** Criar é estrito; editar deixa passar o inválido já gravado (a action só recusa o que mudou). */
const camposDoFornecedor = (legado: boolean) => ({
  documento: campo.cpfCnpj({ legado }),
  email: campo.email({ legado }),
  telefone: campo.telefone({ legado }),
});
const fornecedorBase = {
  tipo: z.enum(["PF", "PJ"]),
  nome: z.string().min(1, "Informe o nome."),
  servico: z.string().optional(),
  observacoes: z.string().optional(),
};
export const fornecedorSchema = z.object({ ...fornecedorBase, ...camposDoFornecedor(false) });
export const fornecedorEditSchema = z.object({ id, ...fornecedorBase, ...camposDoFornecedor(true) });

export const socioSchema = z.object({
  userId: id,
  percentual: z.number().min(0).max(100),
});
export const socioEditSchema = z.object({ id, percentual: z.number().min(0).max(100) });

export const idSchema = z.object({ id });
export const toggleSchema = z.object({ id, ativo: z.boolean() });
