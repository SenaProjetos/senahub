import { z } from "zod";

export const ALVO_TIPOS = ["todos", "categoria", "usuarios"] as const;
export type AvisoAlvoTipo = (typeof ALVO_TIPOS)[number];

/**
 * Criação de aviso geral. Alvo:
 * - `todos`: toda a base ativa (equipe; clientes só se `incluirClientes`).
 * - `categoria`: usuários cujo `role` está em `alvoRoles`.
 * - `usuarios`: usuários específicos (`userIds`).
 */
export const criarAvisoSchema = z
  .object({
    titulo: z.string().min(1, "Informe o título."),
    corpo: z.string().optional().or(z.literal("")),
    alvoTipo: z.enum(ALVO_TIPOS),
    alvoRoles: z.array(z.string()).default([]),
    userIds: z.array(z.string()).default([]),
    incluirClientes: z.boolean().default(false),
    exigeConfirmacao: z.boolean().default(true),
    enviarEmail: z.boolean().default(false),
    imagemPath: z.string().optional(),
  })
  .refine((v) => v.alvoTipo !== "categoria" || v.alvoRoles.length > 0, {
    message: "Selecione ao menos uma categoria.",
    path: ["alvoRoles"],
  })
  .refine((v) => v.alvoTipo !== "usuarios" || v.userIds.length > 0, {
    message: "Selecione ao menos um usuário.",
    path: ["userIds"],
  });

export type CriarAvisoInput = z.infer<typeof criarAvisoSchema>;
