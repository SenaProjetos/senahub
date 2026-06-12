import "server-only";
import { prisma } from "@/lib/prisma";

export async function minhasSolicitacoes(userId: string) {
  const [abonos, ferias] = await Promise.all([
    prisma.abonoFalta.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.ferias.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);
  return { abonos, ferias };
}

export async function abonosPendentes() {
  return prisma.abonoFalta.findMany({
    where: { status: "pendente" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true } } },
  });
}

export async function feriasPendentes() {
  return prisma.ferias.findMany({
    where: { status: "pendente" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true } } },
  });
}

export async function humorHoje(userId: string) {
  const dia = new Date();
  dia.setHours(0, 0, 0, 0);
  return prisma.registroEmocao.findUnique({ where: { userId_dia: { userId, dia } } });
}

/** Clima agregado dos últimos 30 dias — ANÔNIMO (sem nomes). */
export async function climaResumo() {
  const desde = new Date();
  desde.setDate(desde.getDate() - 30);
  desde.setHours(0, 0, 0, 0);

  const registros = await prisma.registroEmocao.findMany({
    where: { dia: { gte: desde } },
    orderBy: { createdAt: "desc" },
    select: { humor: true, comentario: true, createdAt: true },
  });

  const total = registros.length;
  const media = total > 0 ? registros.reduce((s, r) => s + r.humor, 0) / total : 0;
  const distribuicao = [1, 2, 3, 4, 5].map((h) => ({
    humor: h,
    qtd: registros.filter((r) => r.humor === h).length,
  }));
  const comentarios = registros
    .filter((r) => r.comentario?.trim())
    .map((r) => ({ comentario: r.comentario!, humor: r.humor, createdAt: r.createdAt }));

  return { total, media, distribuicao, comentarios };
}

export type AbonoPendente = Awaited<ReturnType<typeof abonosPendentes>>[number];
export type FeriasPendente = Awaited<ReturnType<typeof feriasPendentes>>[number];
