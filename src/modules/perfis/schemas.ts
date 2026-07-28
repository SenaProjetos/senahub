import { z } from "zod";

/** `chave` gerada a partir do nome — slug estável, minúsculo, `[a-z0-9_]`. */
export function slugificar(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (marcas de combinação Unicode)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export const criarPerfilSchema = z.object({
  nome: z.string().trim().min(2, "Informe um nome.").max(80),
  descricao: z.string().trim().max(300).optional(),
});

export const editarPerfilSchema = z.object({
  id: z.string().min(1),
  nome: z.string().trim().min(2, "Informe um nome.").max(80),
  descricao: z.string().trim().max(300).optional(),
});

export const idPerfilSchema = z.object({ id: z.string().min(1) });

export const setPermissaoPerfilSchema = z.object({
  perfilId: z.string().min(1),
  recurso: z.string().min(1),
  acao: z.string().min(1),
  permitido: z.boolean(),
});

export const criarOverrideSchema = z.object({
  userId: z.string().min(1),
  recurso: z.string().min(1),
  acao: z.string().min(1),
  permitido: z.boolean(),
  motivo: z.string().trim().min(5, "Explique o motivo (mín. 5 caracteres)."),
  expiraEm: z.string().optional().or(z.literal("")),
});

export const revogarOverrideSchema = z.object({ id: z.string().min(1) });
