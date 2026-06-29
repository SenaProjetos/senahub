"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/notificar";
import { HR_ADMIN_ROLES } from "@/lib/roles";

const base = { modulo: "rh" } as const;
const adminBase = { modulo: "rh", roles: HR_ADMIN_ROLES } as const;

// ── Self-service ──────────────────────────────────────────────
export const solicitarFerias = defineAction(
  {
    ...base,
    acao: "solicitar-ferias",
    entidade: "Ferias",
    schema: z.object({
      inicio: z.string().min(1),
      fim: z.string().min(1),
      observacao: z.string().optional(),
    }),
  },
  async (i, { user }) => {
    const f = await prisma.ferias.create({
      data: { userId: user.id, inicio: new Date(i.inicio), fim: new Date(i.fim), observacao: i.observacao || null },
    });
    await notificarGestores("Solicitação de férias", `${user.name} solicitou férias.`, "/rh/admin");
    revalidatePath("/rh");
    return { id: f.id };
  },
);

export const registrarHumor = defineAction(
  {
    ...base,
    acao: "registrar-humor",
    entidade: "RegistroEmocao",
    schema: z.object({ humor: z.number().int().min(1).max(5), comentario: z.string().optional() }),
    audit: false,
  },
  async (i, { user }) => {
    const dia = new Date();
    dia.setHours(0, 0, 0, 0);
    await prisma.registroEmocao.upsert({
      where: { userId_dia: { userId: user.id, dia } },
      create: { userId: user.id, dia, humor: i.humor, comentario: i.comentario || null },
      update: { humor: i.humor, comentario: i.comentario || null },
    });
    revalidatePath("/rh");
    return { ok: true };
  },
);

/**
 * Feedback livre à empresa (do herocard). `anonimo` → não grava userId (RH não vê o autor).
 * `audit: false` p/ que, quando anônimo, não exista trilha ligando autor ↔ conteúdo.
 */
export const registrarHumorFeedback = defineAction(
  {
    ...base,
    acao: "registrar-humor-feedback",
    entidade: "FeedbackHumor",
    schema: z.object({ conteudo: z.string().min(1, "Escreva algo.").max(2000), anonimo: z.boolean().default(false) }),
    audit: false,
  },
  async (i, { user }) => {
    await prisma.feedbackHumor.create({
      data: { conteudo: i.conteudo, anonimo: i.anonimo, userId: i.anonimo ? null : user.id },
    });
    return { ok: true };
  },
);

// ── Validação (gestores) ──────────────────────────────────────
const validarSchema = z.object({ id: z.string().min(1), aprovar: z.boolean() });

export const validarAbono = defineAction(
  { ...adminBase, acao: "validar-abono", entidade: "AbonoFalta", schema: validarSchema },
  async (i, { user }) => {
    const abono = await prisma.abonoFalta.findUnique({ where: { id: i.id } });
    if (!abono) throw new ActionError("Abono não encontrado.");
    await prisma.abonoFalta.update({
      where: { id: i.id },
      data: {
        status: i.aprovar ? "aprovado" : "rejeitado",
        validadoPorId: user.id,
        validadoEm: new Date(),
      },
    });
    await notificar(abono.userId, {
      titulo: i.aprovar ? "Abono aprovado" : "Abono rejeitado",
      corpo: "Sua solicitação de abono foi avaliada.",
      href: "/rh",
    });
    revalidatePath("/rh/admin");
    return { id: i.id };
  },
);

export const validarFerias = defineAction(
  { ...adminBase, acao: "validar-ferias", entidade: "Ferias", schema: validarSchema },
  async (i, { user }) => {
    const f = await prisma.ferias.findUnique({ where: { id: i.id } });
    if (!f) throw new ActionError("Solicitação não encontrada.");
    await prisma.ferias.update({
      where: { id: i.id },
      data: { status: i.aprovar ? "aprovado" : "rejeitado", validadoPorId: user.id },
    });
    await notificar(f.userId, {
      titulo: i.aprovar ? "Férias aprovadas" : "Férias rejeitadas",
      corpo: "Sua solicitação de férias foi avaliada.",
      href: "/rh",
    });
    revalidatePath("/rh/admin");
    return { id: i.id };
  },
);

export const definirEscala = defineAction(
  {
    ...adminBase,
    acao: "definir-escala",
    entidade: "EscalaTrabalho",
    schema: z.object({ userId: z.string().min(1), horasDia: z.number().min(0).max(24) }),
  },
  async (i) => {
    await prisma.escalaTrabalho.upsert({
      where: { userId: i.userId },
      create: { userId: i.userId, horasDia: i.horasDia },
      update: { horasDia: i.horasDia },
    });
    revalidatePath("/rh/admin");
    return { userId: i.userId };
  },
);

async function notificarGestores(titulo: string, corpo: string, href: string) {
  const gestores = await prisma.user.findMany({
    where: { ativo: true, role: { in: HR_ADMIN_ROLES as never } },
    select: { id: true },
  });
  await Promise.all(gestores.map((g) => notificar(g.id, { titulo, corpo, href })));
}
