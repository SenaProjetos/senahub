/**
 * Mapa dos PAPÉIS LEGADOS (só como chave de semente) → chave/nome do Perfil de acesso semente
 * (Onda B). Puro, sem I/O — o módulo de seed (`prisma/seed-perfis-acesso.ts`) importa daqui.
 *
 * O enum `Role` saiu do banco na Onda F; estas chaves sobrevivem porque `PERMISSOES_BASE` ainda
 * descreve a semente por papel (`lib/permissoes-base.ts`) e os avisos antigos de "categoria"
 * guardam papéis em `alvoRoles`. Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md
 */

/** Papéis que a semente conhece. Texto, não enum do banco. */
export const PAPEIS_SEMENTE = [
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

export type PapelSemente = (typeof PAPEIS_SEMENTE)[number];

/** `admin` fica fora: vira `superUsuario`, nunca um perfil (bypass editável por tela é a falha que este motor evita). */
export const CHAVE_POR_ROLE: Partial<Record<PapelSemente, string>> = {
  supervisor: "coordenador",
  administrativo: "administrativo",
  clt: "clt",
  estagiario: "estagiario",
  projetista_pj: "projetista_pj",
  freelancer: "freelancer",
  ti: "ti",
  cliente: "portal_cliente",
};

/**
 * Perfil semente que uma pessoa recém-contratada recebe pelo vínculo (assistente do RH). Pró-labore
 * fica sem: sócio tem o acesso decidido à mão em Configurações → Usuários.
 */
export const PERFIL_PADRAO_POR_CONTRATACAO: Record<"clt" | "estagio" | "pj" | "autonomo_rpa" | "pro_labore", string | null> = {
  clt: "clt",
  estagio: "estagiario",
  pj: "projetista_pj",
  autonomo_rpa: "freelancer",
  pro_labore: null,
};

export const NOME_POR_ROLE: Partial<Record<PapelSemente, string>> = {
  admin: "Administrador",
  supervisor: "Coordenador",
  administrativo: "Administrativo",
  clt: "CLT",
  estagiario: "Estagiário",
  projetista_pj: "Projetista PJ",
  freelancer: "Freelancer",
  cliente: "Cliente (portal)",
  ti: "TI",
};
