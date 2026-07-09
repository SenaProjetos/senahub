import { z } from "zod";
import { ROLES } from "@/lib/roles";

export const criarUsuarioSchema = z.object({
  name: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido."),
  role: z.enum(ROLES),
  clienteId: z.string().optional().or(z.literal("")),
  // Fase 2 — cadastro inicial opcional, preenchido no mesmo ato (evita "pessoa pela metade").
  nomeCompleto: z.string().max(120).optional().or(z.literal("")),
  cpf: z.string().max(14).optional().or(z.literal("")),
  telefone: z.string().max(20).optional().or(z.literal("")),
  cargo: z.string().max(80).optional().or(z.literal("")),
  dataAdmissao: z.string().optional().or(z.literal("")),
  salarioBase: z.number().nonnegative().optional(),
  /** PJ (CNPJ) vinculada — só p/ projetista_pj/freelancer. */
  pjId: z.string().optional().or(z.literal("")),
});

export const editarUsuarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2, "Informe o nome."),
  /** Nome completo (cadastro/documentos formais). Vazio = usa o nome de exibição. */
  nomeCompleto: z.string().max(120).optional().or(z.literal("")),
  role: z.enum(ROLES),
  clienteId: z.string().optional().or(z.literal("")),
  /** Sócio ativo — só admin pode alterar (validado na action). */
  ehSocio: z.boolean().optional(),
});

/** Auto-serviço: o próprio usuário escolhe o nome de exibição (não sensível, sem validação). */
export const nomeExibicaoSchema = z.object({
  name: z.string().min(2, "Informe o nome.").max(80),
});

export const usuarioIdSchema = z.object({ id: z.string().min(1) });

export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;
export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>;
