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
  // O valor do enum segue `supervisor` (banco, permissões, migrations); só o rótulo mudou.
  // Vira o perfil de acesso "Coordenador" na reforma de Setor × Contratação × Perfil.
  supervisor: "Coordenador",
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

/**
 * Perfis elegíveis ao cadastro completo de colaborador (exclui cliente e ti).
 *
 * `ti` fica de fora: é gate técnico de `patrimonio:ti` (máquinas), não vínculo empregatício —
 * a ficha de pessoa não faz sentido pra esse papel (ver `rh/pessoas/[id]/page.tsx`, comentário
 * "nunca cliente/ti"). `freelancer` entra: é projetista PJ como `projetista_pj`, com cadastro
 * trabalhista completo (2.4).
 *
 * Única fonte — antes havia cópias divergentes em `funcionarios/actions.ts` e
 * `wizard-cadastro-funcionario.tsx` (uma tinha `ti`, outra `freelancer`); consolidado em 2.4.
 */
export const CADASTRO_ROLES: Role[] = ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj", "freelancer"];

/**
 * Perfis que a própria pessoa pode PEDIR no auto-cadastro público (/solicitar-cadastro).
 * Exclui perfis privilegiados/internos (admin, supervisor, administrativo, ti) — o pedido
 * é só um palpite; o admin decide o vínculo real na criação.
 */
export const SOLICITACAO_CADASTRO_ROLES: Role[] = ["cliente", "clt", "estagiario", "projetista_pj", "freelancer"];

/**
 * Acesso GLOBAL de LEITURA: enxerga todos os projetos da empresa, não só aqueles em que a pessoa
 * é membro ou responsável. É **escopo de dados**, não permissão de tela — alimenta
 * `escopoProjeto()` e os 27 gates de download/relatório que dependem dele.
 *
 * Desde a Onda D resolve por `superUsuario` (o bypass do motor) ou pela permissão sintética
 * `escopo:global` do Perfil de acesso, já calculada uma vez por request em `getSession()`. Antes
 * era `role === "admin" || GLOBAL_ROLES.includes(role) || ehSocio` — três regras em código, fora
 * da tela de Permissões e fora do arnês de equivalência.
 *
 * Duas mudanças reais vieram com isso, ambas decididas e medidas:
 *   - o **Coordenador perde** o escopo global (§9.7/§14.9 — a empresa vai para gestores por setor,
 *     não uma coordenação que vê tudo);
 *   - o **sócio mantém**, mas por override nominal e auditável (§15.15), não por `if (ehSocio)`.
 */
export function acessoGlobal(u: EscopoDeDados): boolean {
  return u.superUsuario === true || u.escopoGlobalPerfil === true;
}

/**
 * O que basta para decidir escopo de dados. Os dois campos são **obrigatórios de propósito**:
 * opcionais fariam um viewer parcial (`{ id, role }`) compilar e resolver `false` em silêncio —
 * fail-closed, mas silencioso, que é como se perde acesso sem ninguém perceber. Exigindo-os, o
 * compilador aponta cada lugar que precisa carregar o dado da sessão.
 */
export type EscopoDeDados = { superUsuario: boolean; escopoGlobalPerfil: boolean };
