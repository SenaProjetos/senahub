import { z } from "zod";
import { campo } from "@/lib/campos/zod";

export const criarUsuarioSchema = z.object({
  name: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido."), // campo-ok: e-mail de login (better-auth)
  /** Equipe interna ou cliente do portal. Não existe mais papel (Onda F). */
  tipo: z.enum(["interno", "externo"]),
  clienteId: z.string().optional().or(z.literal("")),
  /** Vínculo (equipe interna): como a pessoa é contratada. Nasce junto com a conta. */
  contratacao: z.enum(["clt", "estagio", "pj", "autonomo_rpa", "pro_labore"]).optional(),
  setor: z.enum(["diretoria", "administrativo", "juridico", "engenharia", "ti"]).optional(),
  /** Permissões dadas pessoa a pessoa (só superusuário concede — validado na action). */
  gereRh: z.boolean().optional(),
  moderaChat: z.boolean().optional(),
  // Fase 2 — cadastro inicial opcional, preenchido no mesmo ato (evita "pessoa pela metade").
  nomeCompleto: z.string().max(120).optional().or(z.literal("")),
  cpf: campo.cpf(),
  telefone: campo.telefone(),
  /** Id do cargo no catálogo (2.1) — o texto livre saiu; o rótulo em `User.cargo` é cache. */
  cargoId: z.string().optional().or(z.literal("")),
  dataAdmissao: z.string().optional().or(z.literal("")),
  salarioBase: z.number().nonnegative().optional(),
  /** PJ (CNPJ) vinculada — só para PJ/autônomo. */
  pjId: z.string().optional().or(z.literal("")),
  /** Perfil de acesso — decide as telas e ações. */
  perfilId: z.string().optional().or(z.literal("")),
});

export const editarUsuarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2, "Informe o nome."),
  /** Nome completo (cadastro/documentos formais). Vazio = usa o nome de exibição. */
  nomeCompleto: z.string().max(120).optional().or(z.literal("")),
  clienteId: z.string().optional().or(z.literal("")),
  /** Sócio ativo — só admin pode alterar (validado na action). */
  ehSocio: z.boolean().optional(),
  /** Perfil de acesso — decide as telas e ações. */
  perfilId: z.string().optional().or(z.literal("")),
  /** Gestão de RH / moderar o chat dados pessoa a pessoa — só superusuário altera. */
  gereRh: z.boolean().optional(),
  moderaChat: z.boolean().optional(),
  /** Bypass total — só admin pode alterar (validado na action), mesmo raciocínio de `ehSocio`. */
  superUsuario: z.boolean().optional(),
});

/** Auto-serviço: o próprio usuário escolhe o nome de exibição (não sensível, sem validação). */
export const nomeExibicaoSchema = z.object({
  name: z.string().min(2, "Informe o nome.").max(80),
});

export const usuarioIdSchema = z.object({ id: z.string().min(1) });

export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;
export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>;
