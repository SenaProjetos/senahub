import { z } from "zod";

export const ALVO_TIPOS = [
  "todos",
  "categoria",
  "usuarios",
  "setor",
  "contratacao",
  "perfil",
] as const;
export type AvisoAlvoTipo = (typeof ALVO_TIPOS)[number];

export const SETORES = ["diretoria", "administrativo", "juridico", "engenharia", "ti"] as const;
export const CONTRATACOES = ["clt", "estagio", "pj", "autonomo_rpa", "pro_labore"] as const;

/**
 * Criação de aviso geral. Alvo (o `alvoTipo` é o discriminador — um aviso mira UM eixo):
 * - `todos`: toda a base ativa (equipe; clientes só se `incluirClientes`).
 * - `usuarios`: usuários específicos (`userIds`).
 * - `setor` / `contratacao` / `perfil`: os eixos da reforma de acesso.
 * - `categoria`: LEGADO, por `Role` (`alvoRoles`) — a tela não oferece mais; existe para os
 *   avisos já gravados continuarem resolvendo. Sai com `User.role` na Onda F.
 */
export const criarAvisoSchema = z
  .object({
    titulo: z.string().min(1, "Informe o título."),
    corpo: z.string().optional().or(z.literal("")),
    alvoTipo: z.enum(ALVO_TIPOS),
    alvoRoles: z.array(z.string()).default([]),
    alvoSetores: z.array(z.enum(SETORES)).default([]),
    alvoContratacoes: z.array(z.enum(CONTRATACOES)).default([]),
    /** `PerfilAcesso.chave` — cadastrável em runtime, então validado contra o banco na action. */
    alvoPerfis: z.array(z.string().min(1)).default([]),
    userIds: z.array(z.string()).default([]),
    incluirClientes: z.boolean().default(false),
    exigeConfirmacao: z.boolean().default(true),
    enviarEmail: z.boolean().default(false),
    imagemPath: z.string().optional(),
    /** ISO do envio programado. Ausente/vazio = envia na hora. */
    agendadoPara: z.string().optional().or(z.literal("")),
  })
  .refine((v) => v.alvoTipo !== "categoria" || v.alvoRoles.length > 0, {
    message: "Selecione ao menos uma categoria.",
    path: ["alvoRoles"],
  })
  .refine((v) => v.alvoTipo !== "usuarios" || v.userIds.length > 0, {
    message: "Selecione ao menos um usuário.",
    path: ["userIds"],
  })
  .refine((v) => v.alvoTipo !== "setor" || v.alvoSetores.length > 0, {
    message: "Selecione ao menos um setor.",
    path: ["alvoSetores"],
  })
  .refine((v) => v.alvoTipo !== "contratacao" || v.alvoContratacoes.length > 0, {
    message: "Selecione ao menos uma contratação.",
    path: ["alvoContratacoes"],
  })
  .refine((v) => v.alvoTipo !== "perfil" || v.alvoPerfis.length > 0, {
    message: "Selecione ao menos um perfil de acesso.",
    path: ["alvoPerfis"],
  });

export type CriarAvisoInput = z.infer<typeof criarAvisoSchema>;
