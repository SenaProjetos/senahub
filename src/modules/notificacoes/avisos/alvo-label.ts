/**
 * Rótulo pt-BR de "quem foi mirado" por um aviso.
 *
 * PURA e client-safe (sem `server-only`, sem Prisma client) — mas resolvida no SERVIDOR e
 * enviada pronta às telas, porque duas delas (`avisos-agendados`, `avisos-registro`) tinham
 * cada uma a sua cópia do texto, e com 6 valores de `alvoTipo` em vez de 3 a duplicata passa
 * a divergir na primeira mudança.
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (R6).
 */
import type { Contratacao, Setor } from "@/generated/prisma/client";
import { CONTRATACAO_LABELS, SETOR_LABELS } from "@/modules/usuarios/vinculo/labels";
import { ROLE_LABELS, type Role } from "@/lib/roles";

export type AlvoDoAviso = {
  alvoTipo: string;
  alvoRoles: string[];
  alvoSetores: Setor[];
  alvoContratacoes: Contratacao[];
  alvoPerfis: string[];
};

/**
 * @param nomePorChavePerfil `PerfilAcesso.chave` → nome pt-BR. Chave sem entrada cai na própria
 *   chave, em vez de sumir: perfil excluído tem de continuar legível no registro histórico.
 */
export function alvoLabel(
  a: AlvoDoAviso,
  nomePorChavePerfil: Record<string, string> = {},
): string {
  switch (a.alvoTipo) {
    case "todos":
      return "Todos";
    case "usuarios":
      return "Por nome";
    case "setor":
      return a.alvoSetores.map((s) => SETOR_LABELS[s] ?? s).join(", ") || "Setores";
    case "contratacao":
      return a.alvoContratacoes.map((c) => CONTRATACAO_LABELS[c] ?? c).join(", ") || "Contratações";
    case "perfil":
      return a.alvoPerfis.map((p) => nomePorChavePerfil[p] ?? p).join(", ") || "Perfis";
    case "categoria":
      return a.alvoRoles.map((r) => ROLE_LABELS[r as Role] ?? r).join(", ") || "Categorias";
    default:
      // Dado gravado por versão mais nova do código. Honesto em vez de adivinhar um alvo.
      return "Alvo desconhecido";
  }
}
