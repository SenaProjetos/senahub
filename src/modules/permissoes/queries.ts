import "server-only";
import { prisma } from "@/lib/prisma";
import { PERMISSOES_CATALOGO } from "@/lib/permissions-catalog";
import { ROLES } from "@/lib/roles";

/** Mapa role → "recurso:acao" → permitido, mesclando catálogo + banco. */
export async function carregarMatriz() {
  const rows = await prisma.permissao.findMany();
  const byKey = new Map<string, boolean>();
  for (const r of rows) byKey.set(`${r.role}:${r.recurso}:${r.acao}`, r.permitido);

  const matriz: Record<string, Record<string, boolean>> = {};
  for (const role of ROLES) {
    matriz[role] = {};
    for (const rec of PERMISSOES_CATALOGO) {
      for (const a of rec.acoes) {
        const key = `${rec.recurso}:${a.acao}`;
        matriz[role][key] = byKey.get(`${role}:${key}`) ?? false;
      }
    }
  }
  return matriz;
}
