import { z } from "zod";
import { ROLES } from "@/lib/roles";

export const criarUsuarioSchema = z.object({
  name: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido."),
  role: z.enum(ROLES),
});

export const editarUsuarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2, "Informe o nome."),
  role: z.enum(ROLES),
});

export const usuarioIdSchema = z.object({ id: z.string().min(1) });

export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;
export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>;
