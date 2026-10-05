import { z } from "zod";
import { campo } from "@/lib/campos/zod";

/**
 * Campos com formato: criar é estrito; editar deixa passar o inválido que já estava gravado
 * (`legado`) e a action decide com `exigirCamposValidos` (só recusa o que mudou).
 */
const camposComFormato = (legado: boolean) => ({
  documento: campo.cpfCnpj({ legado }),
  email: campo.email({ legado }),
  telefone: campo.telefone({ legado }),
  cep: campo.cep({ legado }),
});

const base = {
  tipo: z.enum(["PF", "PJ"]),
  nome: z.string().min(2, "Informe o nome / razão social."),
  nomeFantasia: z.string().optional(),
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

export const criarClienteSchema = z.object({ ...base, ...camposComFormato(false) });
export const editarClienteSchema = z.object({ id: z.string().min(1), ...base, ...camposComFormato(true) });
export const clienteIdSchema = z.object({ id: z.string().min(1) });

/** Novo contato vinculado a um cliente (model ContatoCliente). */
export const adicionarContatoSchema = z.object({
  clienteId: z.string().min(1),
  nome: z.string().min(2, "Informe o nome do contato."),
  cargo: z.string().optional(),
  email: campo.email(),
  telefone: campo.telefone(),
});

/** Edição inline de um contato existente (F1.11, aba Contatos do formulário). */
export const editarContatoSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(2, "Informe o nome do contato."),
  cargo: z.string().optional(),
  email: campo.email({ legado: true }),
  telefone: campo.telefone({ legado: true }),
  principal: z.boolean().optional(),
});

export const buscarContatosClienteSchema = z.object({ clienteId: z.string().min(1) });

/** Fusão de clientes duplicados (F1.14). O sobrevivente é escolhido por quem executa. */
export const mesclarClientesSchema = z.object({
  sobreviventeId: z.string().min(1),
  absorvidoId: z.string().min(1),
});

/** Checagem de duplicata (F1.13) ao digitar CNPJ/nome/e-mail na criação de um cliente. */
export const buscarCandidatosDuplicataSchema = z.object({
  nome: z.string().optional(),
  tipo: z.enum(["PF", "PJ"]).optional(),
  documento: z.string().optional(), // campo-ok: busca de duplicata a cada tecla, aceita valor parcial
  email: z.string().optional(), // campo-ok: busca de duplicata a cada tecla, aceita valor parcial
});

/** Consulta cadastral pública para preencher um formulário de cliente PJ. */
export const consultarCnpjSchema = z.object({
  cnpj: campo.cnpj({ obrigatorio: true }),
});

export type CriarClienteInput = z.infer<typeof criarClienteSchema>;
export type EditarClienteInput = z.infer<typeof editarClienteSchema>;
export type AdicionarContatoInput = z.infer<typeof adicionarContatoSchema>;
export type EditarContatoInput = z.infer<typeof editarContatoSchema>;
