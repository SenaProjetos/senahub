/**
 * Mapa role legado → chave/nome do Perfil de acesso semente (Onda B). Puro, sem I/O — o
 * módulo de seed (`prisma/seed-perfis-acesso.ts`) importa daqui.
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§8, Onda B)
 */
import { ROLE_LABELS, type Role } from "@/lib/roles";

/** `admin` fica fora: vira `superUsuario`, nunca um perfil (bypass editável por tela é a falha que este motor evita). */
export const CHAVE_POR_ROLE: Partial<Record<Role, string>> = {
  supervisor: "coordenador",
  administrativo: "administrativo",
  clt: "clt",
  estagiario: "estagiario",
  projetista_pj: "projetista_pj",
  freelancer: "freelancer",
  ti: "ti",
  cliente: "portal_cliente",
};

export const NOME_POR_ROLE: Partial<Record<Role, string>> = {
  ...ROLE_LABELS,
  cliente: "Cliente (portal)",
};
