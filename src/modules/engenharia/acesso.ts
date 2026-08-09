import "server-only";
import { can, type SubjectAutorizacao } from "@/lib/permissions";

/**
 * Permissões do recurso `biblioteca_tecnica` (Padrões técnicos + Normas catalogadas,
 * grupo Engenharia). Fonte única para as páginas e rotas. `can()` já dá bypass ao admin.
 */

/** Pode ver a biblioteca (padrões e normas). */
export function podeVerBiblioteca(user: SubjectAutorizacao): Promise<boolean> {
  return can(user, "biblioteca_tecnica", "ver");
}

/** Pode incluir novos padrões/normas. */
export function podeIncluirBiblioteca(user: SubjectAutorizacao): Promise<boolean> {
  return can(user, "biblioteca_tecnica", "incluir");
}

/** Pode editar/excluir padrões/normas de QUALQUER autor (o autor sempre mexe nos seus). */
export function podeGerirBiblioteca(user: SubjectAutorizacao): Promise<boolean> {
  return can(user, "biblioteca_tecnica", "gerir");
}
