import "server-only";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/roles";
import { FONTES, fonteDef, type FonteDef } from "@/modules/documentos/fontes-meta";

/**
 * Permissão por fonte do Estúdio de Documentos.
 *
 * Cada FonteDef pode declarar `permissao: { recurso, acao }`. O usuário só
 * enxerga/usa a fonte se `can(role, recurso, acao)` (admin tem bypass).
 * Fontes sem `permissao` (ex.: "empresa") são liberadas para todos.
 *
 * Datasets de CSV (fonte "dataset:<id>") não passam por aqui — são protegidos
 * por documentos:gerir na sua própria tela e não expõem dados de outros módulos.
 */

/** Item leve (sem dados pesados) para enviar à UI: id + label. */
export type FonteOpcao = { id: string; label: string };

/** O viewer pode ver/usar uma fonte específica? (admin sempre; sem permissao = sim) */
export async function podeVerFonte(role: Role, fonteId: string | null | undefined): Promise<boolean> {
  const def = fonteDef(fonteId);
  // Fonte desconhecida (ou nula) → não há dado de módulo a proteger.
  if (!def) return true;
  if (!def.permissao) return true;
  return can(role, def.permissao.recurso, def.permissao.acao);
}

/** Retorna as FonteDef que o viewer pode ver (admin vê todas). */
export async function fontesPermitidas(role: Role): Promise<FonteDef[]> {
  const resultado = await Promise.all(
    FONTES.map(async (f) => ((await podeVerFonte(role, f.id)) ? f : null)),
  );
  return resultado.filter((f): f is FonteDef => f !== null);
}

/** Versão enxuta (id + label) para passar a componentes client. */
export async function fontesPermitidasOpcoes(role: Role): Promise<FonteOpcao[]> {
  const fontes = await fontesPermitidas(role);
  return fontes.map((f) => ({ id: f.id, label: f.label }));
}
