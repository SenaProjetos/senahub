export const ROLES = [
  "admin",
  "supervisor",
  "administrativo",
  "clt",
  "estagiario",
  "projetista_pj",
  "freelancer",
  "cliente",
  "ti",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  administrativo: "Administrativo",
  clt: "CLT",
  estagiario: "Estagiário",
  projetista_pj: "Projetista PJ",
  freelancer: "Freelancer",
  cliente: "Cliente",
  ti: "TI",
};

/** Perfis que enxergam todos os projetos e dados. */
export const GLOBAL_ROLES: Role[] = ["admin", "supervisor"];

/** Perfis que administram RH (ponto, escala, folha, banco de horas). */
export const HR_ADMIN_ROLES: Role[] = ["admin", "supervisor", "administrativo"];

/** Perfis internos (todos exceto cliente). */
export const INTERNAL_ROLES: Role[] = [
  "admin",
  "supervisor",
  "administrativo",
  "clt",
  "estagiario",
  "projetista_pj",
  "freelancer",
  "ti",
];

/** Colaboradores CLT/estágio — sujeitos a holerite, banco de horas e ponto. */
export const CLT_ROLES: Role[] = ["clt", "estagiario"];

/** Perfis que podem ser responsáveis/membros de projeto. */
export const PROJETO_MEMBRO_ROLES: Role[] = ["clt", "estagiario", "projetista_pj", "freelancer"];

/** Perfis PJ — recebem NF, não têm holerite CLT. */
export const PJ_ROLES: Role[] = ["projetista_pj", "freelancer"];

/** Item 4: perfis elegíveis ao cadastro completo de colaborador (exclui freelancer e cliente). */
export const CADASTRO_ROLES: Role[] = ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj", "ti"];

/**
 * Acesso GLOBAL de LEITURA (vê todos os projetos/dados): perfis globais OU sócio ativo.
 * Sócio = piso de supervisor para visualização — não usar para gates de escrita/destrutivos.
 */
export function acessoGlobal(u: { role: Role; ehSocio?: boolean }): boolean {
  return u.role === "admin" || GLOBAL_ROLES.includes(u.role) || u.ehSocio === true;
}
