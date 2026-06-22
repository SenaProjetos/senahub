export const ROLES = [
  "admin",
  "supervisor",
  "administrativo",
  "clt",
  "estagiario",
  "projetista_pj",
  "freelancer",
  "cliente",
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
];

/** Colaboradores CLT/estágio — sujeitos a holerite, banco de horas e ponto. */
export const CLT_ROLES: Role[] = ["clt", "estagiario"];

/** Perfis que podem ser responsáveis/membros de projeto. */
export const PROJETO_MEMBRO_ROLES: Role[] = ["clt", "estagiario", "projetista_pj", "freelancer"];

/** Perfis PJ — recebem NF, não têm holerite CLT. */
export const PJ_ROLES: Role[] = ["projetista_pj", "freelancer"];
