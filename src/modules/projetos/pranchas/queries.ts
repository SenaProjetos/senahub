import "server-only";
import { prisma } from "@/lib/prisma";

/** Catálogos ativos (folha/tipo/fase): globais + específicos do projeto (se informado). */
export async function catalogosPrancha(projetoId?: string) {
  const rows = await prisma.pranchaCatalogo.findMany({
    where: {
      ativo: true,
      OR: [{ projetoId: null }, ...(projetoId ? [{ projetoId }] : [])],
    },
    orderBy: [{ ordem: "asc" }, { sigla: "asc" }],
    select: { id: true, categoria: true, sigla: true, nome: true, projetoId: true, sinonimos: true },
  });
  return {
    folha: rows.filter((r) => r.categoria === "folha"),
    tipo: rows.filter((r) => r.categoria === "tipo"),
    fase: rows.filter((r) => r.categoria === "fase"),
  };
}

export type CatalogosPrancha = Awaited<ReturnType<typeof catalogosPrancha>>;

/** Todos os catálogos (inclui inativos) — para a tela de configuração. */
export async function catalogosPranchaConfig(projetoId: string | null) {
  return prisma.pranchaCatalogo.findMany({
    where: { projetoId },
    orderBy: [{ categoria: "asc" }, { ordem: "asc" }, { sigla: "asc" }],
    select: {
      id: true,
      categoria: true,
      sigla: true,
      nome: true,
      ativo: true,
      ordem: true,
      projetoId: true,
      sinonimos: true,
      versaoDesde: true,
      versaoAte: true,
    },
  });
}

export type PranchaCatalogoRow = Awaited<ReturnType<typeof catalogosPranchaConfig>>[number];

/**
 * Sigla → sigla canônica do catálogo (mesma sigla, ou a de um sinônimo dela). Sigla sem
 * catálogo correspondente volta em maiúsculo, sem quebrar — só não normaliza.
 */
export function mapaCanonico(rows: { sigla: string; sinonimos: string[] }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const sigla = r.sigla.toUpperCase();
    m.set(sigla, sigla);
    for (const sinonimo of r.sinonimos) m.set(sinonimo.toUpperCase(), sigla);
  }
  return m;
}

export function canonizar(sigla: string, mapa: Map<string, string>): string {
  return mapa.get(sigla.toUpperCase()) ?? sigla.toUpperCase();
}
