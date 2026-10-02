import { z } from "zod";

const id = z.string().min(1);
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const opcional = z.string().trim().max(120).optional().nullable().or(z.literal(""));

export const dadosDoAtivoSchema = z.object({
  nome: z.string().trim().min(2, "Dê um nome ao ativo (ex.: CDB 105% CDI).").max(80),
  tipo: z.enum(["cdb", "lci", "lca", "tesouro", "fundo", "poupanca", "debenture", "outro"]),
  instituicao: opcional,
  indexador: opcional,
  liquidez: z.enum(["diaria", "d1", "vencimento", "outra"]),
  vencimento: dia.optional().nullable().or(z.literal("")),
  isentoIR: z.boolean(),
  contaOrigemId: id.optional().nullable().or(z.literal("")),
  observacao: z.string().trim().max(500).optional().nullable().or(z.literal("")),
});

export const novoAtivoSchema = dadosDoAtivoSchema.extend({
  /** Aporte inicial (opcional): sai da conta escolhida no dia informado. */
  aporte: z.object({ valor: z.number().positive("O aporte tem que ser maior que zero."), data: dia, contaId: id }).nullable().optional(),
});

export const editarAtivoSchema = dadosDoAtivoSchema.extend({ id });
export const idAtivoSchema = z.object({ id });
export const arquivarSchema = z.object({ id, arquivar: z.boolean() });

export const aporteSchema = z.object({ investimentoId: id, contaId: id, valor: z.number().positive("Informe o valor do aporte."), data: dia });

export const rendimentoSchema = z.object({
  investimentoId: id,
  /** Reais: o valor BRUTO atual que o banco mostra. */
  brutoInformado: z.number().positive("Informe o valor bruto que o banco mostra."),
  data: dia,
  /** Reais; ausente = usa a sugestão da tabela regressiva. */
  ir: z.number().min(0).nullable().optional(),
});

export const resgateSchema = z.object({
  investimentoId: id,
  contaId: id,
  valorRecebido: z.number().positive("Informe quanto caiu na conta."),
  data: dia,
  total: z.boolean(),
});

export const excluirMovimentoSchema = z.object({ investimentoId: id, lancamentoId: id });
