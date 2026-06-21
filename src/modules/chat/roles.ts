/** Perfis que participam do chat (cliente e freelancer ficam de fora — regra de negócio). */
export const CHAT_ROLES = [
  "admin",
  "supervisor",
  "administrativo",
  "clt",
  "estagiario",
  "projetista_pj",
] as const;

/** Perfis visíveis globalmente em todos os canais de projeto/disciplina. */
export const ROLES_GLOBAIS_CHAT = ["admin", "supervisor"] as const;

/** Perfis excluídos de DMs (além do próprio usuário). */
export const DM_ROLES_EXCLUIDAS = ["cliente", "freelancer"] as const;

export type ChatRole = (typeof CHAT_ROLES)[number];
