import "server-only";
import { prisma } from "@/lib/prisma";

export async function listarHabilidades() {
  return prisma.habilidade.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } });
}

/** Habilidades por usuário (mapa userId → [{id,nome}]). */
export async function habilidadesDeUsuarios(userIds: string[]): Promise<Record<string, { id: string; nome: string }[]>> {
  const vinc = await prisma.userHabilidade.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, habilidade: { select: { id: true, nome: true } } },
  });
  const mapa: Record<string, { id: string; nome: string }[]> = {};
  for (const v of vinc) {
    (mapa[v.userId] ??= []).push(v.habilidade);
  }
  return mapa;
}
