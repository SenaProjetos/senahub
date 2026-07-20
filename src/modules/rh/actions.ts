"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/notificar";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { validarInicioFeriasClt } from "@/lib/ferias-clt";
import { listarFeriados } from "@/modules/rh/feriados/queries";

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
    await garantirInicioFeriasClt(user.role, i.inicio);
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

// ── Edição de férias ──────────────────────────────────────────
const editarPendenteSchema = z.object({
  id: z.string().min(1),
  inicio: z.string().min(1),
  fim: z.string().min(1),
  observacao: z.string().optional(),
});

/**
 * Edição livre de férias AINDA PENDENTES pelo próprio funcionário (antes de qualquer
 * aprovação). Férias já aprovadas usam o fluxo de proposta+dupla aprovação.
 */
export const editarFeriasPendente = defineAction(
  {
    ...base,
    acao: "editar-ferias-pendente",
    entidade: "Ferias",
    schema: editarPendenteSchema,
    capturarAntes: (i) => prisma.ferias.findUnique({ where: { id: i.id } }),
  },
  async (i, { user }) => {
    const f = await prisma.ferias.findUnique({ where: { id: i.id } });
    if (!f) throw new ActionError("Solicitação não encontrada.");
    if (f.userId !== user.id) throw new ActionError("Sem permissão.");
    if (f.status !== "pendente")
      throw new ActionError("Férias já avaliadas — proponha uma alteração para mudar as datas.");
    await garantirInicioFeriasClt(user.role, i.inicio);
    await prisma.ferias.update({
      where: { id: f.id },
      data: { inicio: new Date(i.inicio), fim: new Date(i.fim), observacao: i.observacao || null },
    });
    revalidatePath("/rh");
    return { id: f.id };
  },
);

const proporSchema = z.object({
  id: z.string().min(1),
  inicio: z.string().min(1),
  fim: z.string().min(1),
});

/**
 * Propõe nova data para férias JÁ APROVADAS. Pode ser iniciada pelo funcionário (dono)
 * ou por um gestor de RH; só entra em vigor após aprovação das DUAS partes. O lado de
 * quem propõe já conta como aprovado; a contraparte é notificada para decidir.
 */
export const proporAlteracaoFerias = defineAction(
  {
    ...base,
    acao: "propor-alteracao-ferias",
    entidade: "Ferias",
    schema: proporSchema,
    capturarAntes: (i) => prisma.ferias.findUnique({ where: { id: i.id } }),
  },
  async (i, { user }) => {
    const f = await prisma.ferias.findUnique({ where: { id: i.id } });
    if (!f) throw new ActionError("Solicitação não encontrada.");
    if (f.status !== "aprovado")
      throw new ActionError("Só é possível propor alteração em férias já aprovadas.");
    const ehDono = f.userId === user.id;
    const ehAdmin = (HR_ADMIN_ROLES as readonly string[]).includes(user.role);
    if (!ehDono && !ehAdmin) throw new ActionError("Sem permissão.");
    if (f.altInicio) throw new ActionError("Já existe uma alteração pendente para estas férias.");

    // Regra CLT de início vale para a NOVA data, conforme o perfil do dono das férias.
    const dono = await prisma.user.findUnique({ where: { id: f.userId }, select: { role: true, name: true } });
    await garantirInicioFeriasClt(dono?.role ?? "", i.inicio);

    const okAdmin = ehAdmin;
    const okFunc = ehDono;

    // Caso raro: dono que também é gestor de RH → dupla aprovação já satisfeita, aplica direto.
    if (okAdmin && okFunc) {
      await prisma.ferias.update({
        where: { id: f.id },
        data: { inicio: new Date(i.inicio), fim: new Date(i.fim) },
      });
      revalidatePath("/rh");
      revalidatePath("/rh/admin");
      return { id: f.id, aplicado: true };
    }

    await prisma.ferias.update({
      where: { id: f.id },
      data: {
        altInicio: new Date(i.inicio),
        altFim: new Date(i.fim),
        altPorId: user.id,
        altOkAdmin: okAdmin,
        altOkFunc: okFunc,
      },
    });

    if (ehDono) {
      await notificarGestores(
        "Alteração de férias proposta",
        `${dono?.name ?? "Colaborador"} propôs uma nova data de férias — precisa da sua aprovação.`,
        "/rh/admin",
      );
    } else {
      await notificar(f.userId, {
        titulo: "Alteração de férias proposta",
        corpo: "O RH propôs uma nova data para suas férias. Aprove ou recuse em RH.",
        href: "/rh",
      });
    }
    revalidatePath("/rh");
    revalidatePath("/rh/admin");
    return { id: f.id, aplicado: false };
  },
);

const responderSchema = z.object({ id: z.string().min(1), aprovar: z.boolean() });

/**
 * A contraparte responde à proposta de alteração: aprovar aplica a nova data (o lado de
 * quem propôs já estava aprovado, então uma aprovação completa a dupla); recusar descarta
 * a proposta e mantém as datas originais.
 */
export const responderAlteracaoFerias = defineAction(
  {
    ...base,
    acao: "responder-alteracao-ferias",
    entidade: "Ferias",
    schema: responderSchema,
    capturarAntes: (i) => prisma.ferias.findUnique({ where: { id: i.id } }),
  },
  async (i, { user }) => {
    const f = await prisma.ferias.findUnique({ where: { id: i.id } });
    if (!f || !f.altInicio || !f.altFim) throw new ActionError("Não há alteração pendente.");
    const ehDono = f.userId === user.id;
    const ehAdmin = (HR_ADMIN_ROLES as readonly string[]).includes(user.role);
    // Só pode responder o lado que ainda NÃO aprovou (a contraparte de quem propôs).
    const respondeAdmin = ehAdmin && !f.altOkAdmin;
    const respondeFunc = ehDono && !f.altOkFunc;
    if (!respondeAdmin && !respondeFunc)
      throw new ActionError("Você não tem uma alteração de férias para aprovar aqui.");

    if (!i.aprovar) {
      await prisma.ferias.update({
        where: { id: f.id },
        data: { altInicio: null, altFim: null, altPorId: null, altOkAdmin: false, altOkFunc: false },
      });
      if (f.altPorId && f.altPorId !== user.id) {
        await notificar(f.altPorId, {
          titulo: "Alteração de férias recusada",
          corpo: "A proposta de nova data de férias foi recusada; as datas originais foram mantidas.",
          href: "/rh",
        });
      }
      revalidatePath("/rh");
      revalidatePath("/rh/admin");
      return { id: f.id, aplicado: false };
    }

    // Aprovação da contraparte completa a dupla → aplica a nova data.
    await prisma.ferias.update({
      where: { id: f.id },
      data: {
        inicio: f.altInicio,
        fim: f.altFim,
        altInicio: null,
        altFim: null,
        altPorId: null,
        altOkAdmin: false,
        altOkFunc: false,
      },
    });
    if (f.altPorId && f.altPorId !== user.id) {
      await notificar(f.altPorId, {
        titulo: "Alteração de férias aprovada",
        corpo: "A nova data de férias foi aprovada e já está valendo.",
        href: "/rh",
      });
    }
    revalidatePath("/rh");
    revalidatePath("/rh/admin");
    return { id: f.id, aplicado: true };
  },
);

// definirEscala removido em F7 (substituído por EscalaRole/EscalaUsuario no módulo escalas)

/**
 * Regra CLT de início de férias (art. 134 §3º) — só para colaboradores CLT.
 * Lança ActionError se a data de início cair nos 2 dias que antecedem feriado/domingo.
 */
async function garantirInicioFeriasClt(role: string, inicioISO: string) {
  if (role !== "clt") return;
  const anoIni = Number(inicioISO.slice(0, 4));
  const feriados = new Set(
    [
      ...(await listarFeriados(anoIni)),
      // início + 2 dias pode cair no ano seguinte (borda de 30/31 de dez).
      ...(inicioISO.slice(5, 10) >= "12-30" ? await listarFeriados(anoIni + 1) : []),
    ].map((f) => f.data),
  );
  const chk = validarInicioFeriasClt(inicioISO, feriados);
  if (!chk.valido) throw new ActionError(chk.motivo!);
}

async function notificarGestores(titulo: string, corpo: string, href: string) {
  const gestores = await prisma.user.findMany({
    where: { ativo: true, role: { in: HR_ADMIN_ROLES as never } },
    select: { id: true },
  });
  await Promise.all(gestores.map((g) => notificar(g.id, { titulo, corpo, href })));
}
