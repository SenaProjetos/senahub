import { z } from "zod";

const id = z.string().min(1);

export const rfqItemSchema = z.object({
  insumoId: z.string().min(1).optional(),
  descricao: z.string().min(1, "Informe a descrição."),
  quantidade: z.number().positive("Informe a quantidade."),
  unidade: z.string().min(1, "Informe a unidade."),
});

export const criarRfqSchema = z.object({
  orcamentoId: id.optional(),
  titulo: z.string().min(1, "Informe o título."),
  descricao: z.string().optional(),
  prazoResposta: z.string().optional(), // yyyy-mm-dd
  itens: z.array(rfqItemSchema).min(1, "Informe ao menos um item."),
});

export const convidarFornecedorSchema = z.object({
  rfqId: id,
  fornecedorIds: z.array(id).min(1, "Escolha ao menos um fornecedor."),
});

export const propostaItemSchema = z.object({
  rfqItemId: id,
  precoUnitario: z.number().min(0, "Informe o preço."),
  observacao: z.string().optional(),
});

export const registrarPropostaSchema = z.object({
  rfqId: id,
  fornecedorId: id,
  itens: z.array(propostaItemSchema).min(1, "Informe ao menos um item cotado."),
  frete: z.number().min(0).default(0),
  impostosInclusos: z.boolean().default(true),
  impostosValor: z.number().min(0).optional(),
  prazoEntregaDias: z.number().int().min(0).optional(),
  validadeAte: z.string().optional(), // yyyy-mm-dd
  condicoesPagamento: z.string().optional(),
  observacoes: z.string().optional(),
});

export const escolherVencedorSchema = z.object({
  propostaId: id,
  justificativaEscolha: z.string().min(10, "Justifique a escolha (mín. 10 caracteres)."),
});

export const anexoMetaSchema = z.object({
  caminho: z.string().min(1),
  nome: z.string().min(1),
  mime: z.string().min(1),
  tamanho: z.number().int().nonnegative(),
});

export const adicionarAnexoPropostaSchema = z.object({
  propostaId: id,
  meta: anexoMetaSchema,
});

export const idSchema = z.object({ id });
export const idRfqSchema = z.object({ rfqId: id });
