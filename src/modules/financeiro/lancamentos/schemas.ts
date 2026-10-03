import { z } from "zod";
import { chaveNfeValida, MOTIVO_CHAVE_INVALIDA } from "@/modules/financeiro/lancamentos/baixa";

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

/** Planejador de caixa: nulo = herda da categoria (prioridade) ou padrão do status (confiança). */
export const prioridadeSchema = z.enum(["p1", "p2", "p3", "p4"]);
export const confiancaSchema = z.enum(["confirmada_cliente", "provavel", "estimada", "incerta"]);

export const criarLancamentoSchema = z.object({
  tipo: z.enum(["receita", "despesa"]),
  descricao: z.string().min(1, "Informe a descrição."),
  valor: z.number().positive("Valor deve ser maior que zero."),
  data: z.string().min(1, "Informe a data."),
  vencimento: opt(z.string()),
  dataCompetencia: opt(z.string()),
  categoriaId: z.string().min(1, "Selecione a categoria."),
  centroId: opt(z.string()),
  contaId: opt(z.string()),
  formaId: opt(z.string()),
  projetoId: opt(z.string()),
  fornecedorId: opt(z.string()),
  clienteId: opt(z.string()),
  observacao: opt(z.string()),
  /// Já criar confirmado (realizado), em vez de previsto.
  confirmado: z.boolean().default(false),
  /// Recorrência mensal: nº de ocorrências (1 = sem recorrência).
  ocorrencias: z.number().int().min(1).max(60).default(1),
  /// Só despesa. Ausente/nulo = herda da categoria.
  prioridade: prioridadeSchema.nullable().optional(),
  /// Só receita. Ausente/nulo = padrão do status (D1: provável).
  confianca: confiancaSchema.nullable().optional(),
  /// Só despesa em aberto: a caixinha que paga a saída (F4).
  caixinhaId: z.string().min(1).nullable().optional(),
  /// M7: número do documento (boleto, NF, recibo) e chave de acesso da NF (44 dígitos, conferidos pelo DV).
  numeroDocumento: z.string().trim().max(60).optional().or(z.literal("")),
  chaveNfe: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || chaveNfeValida(v), MOTIVO_CHAVE_INVALIDA),
});

export const editarLancamentoSchema = z.object({
  id: z.string().min(1),
  descricao: z.string().min(1),
  valor: z.number().positive(),
  data: z.string().min(1),
  vencimento: opt(z.string()),
  dataCompetencia: opt(z.string()),
  categoriaId: z.string().min(1),
  centroId: opt(z.string()),
  projetoId: opt(z.string()),
  fornecedorId: opt(z.string()),
  clienteId: opt(z.string()),
  observacao: opt(z.string()),
  /// Ausente = não mexe; nulo = volta a herdar.
  prioridade: prioridadeSchema.nullable().optional(),
  confianca: confiancaSchema.nullable().optional(),
  /// Ausente = não mexe; nulo = tira da caixinha.
  caixinhaId: z.string().min(1).nullable().optional(),
  /// M7: número do documento (boleto, NF, recibo) e chave de acesso da NF (44 dígitos, conferidos pelo DV).
  numeroDocumento: z.string().trim().max(60).optional().or(z.literal("")),
  chaveNfe: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || chaveNfeValida(v), MOTIVO_CHAVE_INVALIDA),
});

/** Menu de contexto e lote de Contas: só a prioridade ou só a confiança. */
export const prioridadeLancamentoSchema = z.object({ id: z.string().min(1), prioridade: prioridadeSchema.nullable() });
export const confiancaLancamentoSchema = z.object({ id: z.string().min(1), confianca: confiancaSchema.nullable() });
export const caixinhaLancamentoSchema = z.object({ id: z.string().min(1), caixinhaId: z.string().min(1).nullable() });

export const confirmarLancamentoSchema = z.object({
  id: z.string().min(1),
  contaId: opt(z.string()),
  formaId: opt(z.string()),
  dataConfirmacao: opt(z.string()),
  /**
   * Legado: valor pago numa linha só. Menor que o título = parcial (vira `principal`); MAIOR = o excedente vira juros
   * (M7) — antes ia para a categoria da própria conta.
   */
  valorEfetivo: z.number().positive().optional(),
  /** M7: quanto do título é quitado (ausente = inteiro), mais juros, multa e desconto, em reais. */
  principal: z.number().positive().optional(),
  juros: z.number().min(0).optional(),
  multa: z.number().min(0).optional(),
  desconto: z.number().min(0).optional(),
});

export const idLancamentoSchema = z.object({ id: z.string().min(1) });

export type CriarLancamentoInput = z.infer<typeof criarLancamentoSchema>;
