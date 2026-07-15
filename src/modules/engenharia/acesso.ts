import "server-only";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/roles";

/**
 * Permissões do recurso `biblioteca_tecnica` (Padrões técnicos + Normas catalogadas,
 * grupo Engenharia). Fonte única para as páginas e rotas. `can()` já dá bypass ao admin.
 */

/** Pode ver a biblioteca (padrões e normas). */
export function podeVerBiblioteca(role: Role): Promise<boolean> {
  return can(role, "biblioteca_tecnica", "ver");
}

/** Pode incluir novos padrões/normas. */
export function podeIncluirBiblioteca(role: Role): Promise<boolean> {
  return can(role, "biblioteca_tecnica", "incluir");
}

/** Pode editar/excluir padrões/normas de QUALQUER autor (o autor sempre mexe nos seus). */
export function podeGerirBiblioteca(role: Role): Promise<boolean> {
  return can(role, "biblioteca_tecnica", "gerir");
}
