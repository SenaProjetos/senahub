import { z } from "zod";
import { validarCpfCnpj } from "@/lib/documento";

/** Documento opcional, mas se preenchido deve ser CPF/CNPJ válido. */
const docValido = (d: { documento?: string }) => !d.documento?.trim() || validarCpfCnpj(d.documento);
const docMsg = { message: "CPF/CNPJ inválido.", path: ["documento"] };

const base = {
  tipo: z.enum(["PF", "PJ"]),
  nome: z.string().min(2, "Informe o nome / razão social."),
  nomeFantasia: z.string().optional(),
  documento: z.string().optional(),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  telefone: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().max(2).optional(),
  /// DEPRECADO (F1.8) em favor de segmentoId/porte — mantido para não remover
  /// capacidade de quem ainda usa; não exibido como primeira opção na UI.
  categoria: z.string().optional(),
  observacoes: z.string().optional(),

  // ── Comercial / LinkedIn (F1.11, campos criados em F1.8) ────────
  segmentoId: z.string().optional(),
  /// Texto livre por ora — vira catálogo só se ganhar regra de negócio (02-schema §2.1).
  porte: z.string().optional(),
  linkedinUrl: z.string().url("URL inválida.").optional().or(z.literal("")),
  salesNavigatorUrl: z.string().url("URL inválida.").optional().or(z.literal("")),
};

/** Opções comuns de categoria de cliente (campo livre — string?). */
export const CATEGORIAS_CLIENTE = [
  "Público",
  "Privado",
  "Construtora",
  "Incorporadora",
  "Franquia",
  "Pessoa física",
  "Outro",
] as const;

export const criarClienteSchema = z.object(base).refine(docValido, docMsg);
export const editarClienteSchema = z.object({ id: z.string().min(1), ...base }).refine(docValido, docMsg);
export const clienteIdSchema = z.object({ id: z.string().min(1) });

/** Novo contato vinculado a um cliente (model ContatoCliente). */
export const adicionarContatoSchema = z.object({
  clienteId: z.string().min(1),
  nome: z.string().min(2, "Informe o nome do contato."),
  cargo: z.string().optional(),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  telefone: z.string().optional(),
});

/** Edição inline de um contato existente (F1.11, aba Contatos do formulário). */
export const editarContatoSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(2, "Informe o nome do contato."),
  cargo: z.string().optional(),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  telefone: z.string().optional(),
  principal: z.boolean().optional(),
});

export const buscarContatosClienteSchema = z.object({ clienteId: z.string().min(1) });

export type CriarClienteInput = z.infer<typeof criarClienteSchema>;
export type EditarClienteInput = z.infer<typeof editarClienteSchema>;
export type AdicionarContatoInput = z.infer<typeof adicionarContatoSchema>;
export type EditarContatoInput = z.infer<typeof editarContatoSchema>;
