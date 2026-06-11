import "server-only";
import { prisma } from "@/lib/prisma";

export async function listarUploadsDisciplina(disciplinaId: string) {
  const uploads = await prisma.upload.findMany({
    where: { disciplinaId },
    orderBy: [{ pacote: "asc" }, { createdAt: "desc" }],
    include: { autor: { select: { name: true } }, validadoPor: { select: { name: true } } },
  });
  return uploads;
}

/** Indica se cada pacote obrigatório (A e B) tem ao menos um arquivo. */
export async function pacotesCompletos(disciplinaId: string) {
  const grupos = await prisma.upload.groupBy({
    by: ["pacote"],
    where: { disciplinaId },
    _count: { _all: true },
  });
  const mapa = new Map(grupos.map((g) => [g.pacote, g._count._all]));
  return {
    a: (mapa.get("A") ?? 0) > 0,
    b: (mapa.get("B") ?? 0) > 0,
    outros: mapa.get("OUTROS") ?? 0,
  };
}

export type UploadItem = Awaited<ReturnType<typeof listarUploadsDisciplina>>[number];
