import "server-only";
import { prisma } from "@/lib/prisma";

/** Pendência (apontamento posicional) já com nomes resolvidos, pronta para o viewer. */
export type PendenciaView = {
  id: string;
  numero: number;
  pagina: number;
  x: number;
  y: number;
  texto: string;
  status: string; // aberta | resolvida | fechada | descartada
  autorId: string;
  autor: string;
  tarefaId: string | null;
  resolvidoEm: string | null;
  fechadoEm: string | null;
  createdAt: string;
};

/** Apontamentos de uma prancha (versão/upload), ordenados por número. */
export async function pendenciasDoUpload(uploadId: string): Promise<PendenciaView[]> {
  const rows = await prisma.pendencia.findMany({
    where: { uploadId },
    orderBy: { numero: "asc" },
  });
  const autorIds = [...new Set(rows.map((r) => r.autorId))];
  const users = autorIds.length
    ? await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } })
    : [];
  const nome = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    pagina: r.pagina,
    x: r.x,
    y: r.y,
    texto: r.texto,
    status: r.status,
    autorId: r.autorId,
    autor: nome.get(r.autorId) ?? "—",
    tarefaId: r.tarefaId,
    resolvidoEm: r.resolvidoEm?.toISOString() ?? null,
    fechadoEm: r.fechadoEm?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Contagem de pendências abertas por uploadId (para badges no explorer). */
export async function contarPendenciasAbertas(uploadIds: string[]): Promise<Map<string, number>> {
  if (uploadIds.length === 0) return new Map();
  const grupos = await prisma.pendencia.groupBy({
    by: ["uploadId"],
    where: { uploadId: { in: uploadIds }, status: "aberta" },
    _count: { _all: true },
  });
  return new Map(grupos.map((g) => [g.uploadId, g._count._all]));
}
