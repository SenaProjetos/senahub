import { GLOBAL_ROLES, type Role } from "@/lib/roles";

/**
 * Regras de acesso PURAS do diário de projeto (sem I/O — testáveis).
 * Escrita numa disciplina: responsável dela ou perfil global (admin/supervisor).
 * Edição/exclusão de uma entrada: autor da entrada ou perfil global.
 */

export function ehGlobal(role: string): boolean {
  return role === "admin" || GLOBAL_ROLES.includes(role as Role);
}

/** Pode escrever no diário da disciplina: responsável dela OU global. */
export function podeEscreverNoDiario(params: {
  role: string;
  ehResponsavelDaDisciplina: boolean;
}): boolean {
  return ehGlobal(params.role) || params.ehResponsavelDaDisciplina;
}

/** Pode editar/excluir uma entrada: autor dela OU global. */
export function podeGerirEntrada(params: {
  userId: string;
  role: string;
  autorId: string;
}): boolean {
  return ehGlobal(params.role) || params.userId === params.autorId;
}
