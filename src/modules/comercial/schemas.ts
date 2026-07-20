import { z } from "zod";

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

// ── Leads / funil ─────────────────────────────────────────────
export const criarLeadSchema = z.object({
  nome: z.string().min(1, "Informe o nome."),
  contato: opt(z.string()),
  email: opt(z.string().email("E-mail inválido.")),
  telefone: opt(z.string()),
  origem: opt(z.string()),
  valorEstimado: z.number().nonnegative().optional(),
  etapaId: z.string().min(1, "Selecione a etapa."),
  observacoes: opt(z.string()),
});
export const editarLeadSchema = criarLeadSchema.extend({ id: z.string().min(1) });
export const moverLeadSchema = z.object({
  id: z.string().min(1),
  etapaId: z.string().min(1),
  /** Obrigatório quando a etapa destino é "Perdido"; validado na action. */
  motivoPerda: opt(z.string()),
});
export const idSchema = z.object({ id: z.string().min(1) });
export const notaLeadSchema = z.object({ leadId: z.string().min(1), nota: z.string().min(1) });
export const converterLeadSchema = z.object({ id: z.string().min(1) });

export const metaSchema = z.object({
  ano: z.number().int().min(2020).max(2100),
  mes: z.number().int().min(1).max(12),
  valor: z.number().nonnegative(),
});

// ── Etapas do funil ───────────────────────────────────────────
const corHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.").optional().or(z.literal(""));
export const criarEtapaSchema = z.object({ nome: z.string().min(1, "Informe o nome."), cor: corHex });
export const editarEtapaSchema = z.object({ id: z.string().min(1), nome: z.string().min(1), cor: corHex });
export const alternarEtapaSchema = z.object({ id: z.string().min(1) });

// ── Tabelas de preço ──────────────────────────────────────────
export const tabelaPrecoSchema = z.object({
  nome: z.string().min(1),
  itens: z.array(z.object({ disciplina: z.string().min(1), valorM2: z.number().nonnegative() })),
});
export const tabelaPrecoEditSchema = tabelaPrecoSchema.extend({ id: z.string().min(1) });

// ── Propostas ─────────────────────────────────────────────────
export const itemPropostaSchema = z.object({
  disciplina: z.string().min(1),
  descricao: opt(z.string()),
  valor: z.number().nonnegative(),
});
export const condicaoPropostaSchema = z.object({
  descricao: z.string().min(1),
  tipo: z.enum(["percentual", "valor"]),
  valor: z.number().nonnegative(),
});

export const criarPropostaSchema = z.object({
  titulo: z.string().min(1, "Informe o título."),
  clienteId: z.string().min(1, "Selecione o cliente."),
  leadId: opt(z.string()),
});

/** Cria a proposta a partir de um lead (deriva/gera o cliente e vincula o lead). */
export const criarPropostaDeLeadSchema = z.object({
  leadId: z.string().min(1),
  titulo: z.string().min(1, "Informe o título."),
});

export const salvarPropostaSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1),
  areaM2: z.number().nonnegative().optional(),
  validade: opt(z.string()),
  observacoes: opt(z.string()),
  itens: z.array(itemPropostaSchema),
  condicoes: z.array(condicaoPropostaSchema),
});

export const statusPropostaSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["rascunho", "enviada", "aceita", "recusada"]),
});

export type SalvarPropostaInput = z.infer<typeof salvarPropostaSchema>;
