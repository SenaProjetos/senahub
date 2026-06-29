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

/** Feedbacks livres à empresa (Mód 1/9). Autor = null quando anônimo. */
export async function listarFeedbackHumor(limite = 30) {
  const rows = await prisma.feedbackHumor.findMany({
    orderBy: { createdAt: "desc" },
    take: limite,
    select: { id: true, conteudo: true, anonimo: true, createdAt: true, user: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    conteudo: r.conteudo,
    autor: r.anonimo ? null : r.user?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
export type FeedbackHumorItem = Awaited<ReturnType<typeof listarFeedbackHumor>>[number];

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

// ── Onboarding (Onda 3f) ──────────────────────────────────────

export async function meuOnboarding(userId: string) {
  return prisma.onboardingProcesso.findUnique({
    where: { userId },
    include: { itens: { orderBy: { ordem: "asc" } } },
  });
}

export async function onboardingsAtivos() {
  return prisma.onboardingProcesso.findMany({
    include: {
      user: { select: { name: true, role: true } },
      itens: { orderBy: { ordem: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function opcoesOnboarding() {
  const [templates, comProcesso] = await Promise.all([
    prisma.onboardingTemplate.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.onboardingProcesso.findMany({ select: { userId: true } }),
  ]);
  const ids = comProcesso.map((p) => p.userId);
  const usuarios = await prisma.user.findMany({
    where: { ativo: true, role: { not: "cliente" }, id: { notIn: ids } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { templates, usuarios };
}

// ── Notas fiscais de PJ (Onda 3g) ─────────────────────────────

export async function minhasNFs(userId: string) {
  return prisma.notaFiscalPJ.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function nfsPendentes() {
  return prisma.notaFiscalPJ.findMany({
    where: { status: "enviada" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true } } },
  });
}

/** NFs já validadas (aprovadas/rejeitadas) — histórico, mais recentes primeiro. */
export async function nfsValidadas() {
  return prisma.notaFiscalPJ.findMany({
    where: { status: { in: ["aprovada", "rejeitada"] } },
    orderBy: [{ validadoEm: "desc" }, { createdAt: "desc" }],
    take: 50,
    include: {
      user: { select: { name: true } },
      validadoPor: { select: { name: true } },
    },
  });
}
