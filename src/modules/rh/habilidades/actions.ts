"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import type { SessionUser } from "@/lib/session";
import { CATEGORIAS, MOTIVO_NAO_PUBLICADA, motivoParaNaoValidar } from "./regras";

const base = { modulo: "recursos", recurso: "recursos", permissao: "gerir" } as const;
const internos = { modulo: "rh", interno: true } as const;
const nivel = z.number().int().min(1, "Nível de 1 a 5.").max(5, "Nível de 1 a 5.");

function rev(userId?: string) {
  revalidatePath("/recursos");
  revalidatePath("/rh/admin");
  revalidatePath("/minha-ficha");
  if (userId) revalidatePath(`/rh/pessoas/${userId}`);
}

const ehRh = (u: Pick<SessionUser, "role">) => (HR_ADMIN_ROLES as readonly string[]).includes(u.role);
/** Quem cuida de competências: o RH ou quem gere Recursos (a coordenação). */
async function gestorOuRh(u: SessionUser) {
  return ehRh(u) || (await can(u, "recursos", "gerir"));
}

/**
 * Cria uma competência. Pelo RH nasce publicada; por quem gere Recursos (Engenharia) nasce como
 * PROPOSTA e só aparece para as pessoas depois que o RH publica.
 */
export const criarHabilidade = defineAction(
  {
    ...internos,
    acao: "criar-habilidade",
    entidade: "Habilidade",
    schema: z.object({ nome: z.string().trim().min(1, "Dê um nome à competência.").max(80), categoria: z.enum(CATEGORIAS).optional() }),
  },
  async (i, { user }) => {
    if (!(await gestorOuRh(user))) throw new ActionError("Sem permissão para criar competência.");
    const publicada = ehRh(user);
    const h = await prisma.habilidade.upsert({
      where: { nome: i.nome },
      create: { nome: i.nome, categoria: i.categoria ?? null, publicada, propostaPorId: publicada ? null : user.id },
      update: {},
    });
    rev();
    return { id: h.id, publicada: h.publicada };
  },
);

/** RH publica uma competência proposta (ou muda a categoria). */
export const publicarHabilidade = defineAction(
  {
    modulo: "rh",
    roles: HR_ADMIN_ROLES,
    acao: "publicar-habilidade",
    entidade: "Habilidade",
    schema: z.object({ id: z.string().min(1), publicada: z.boolean(), categoria: z.enum(CATEGORIAS).optional() }),
    entidadeId: (_d, i) => i.id,
    capturarAntes: (i) => prisma.habilidade.findUnique({ where: { id: i.id }, select: { publicada: true, categoria: true } }),
  },
  async (i) => {
    await prisma.habilidade.update({
      where: { id: i.id },
      data: { publicada: i.publicada, ...(i.categoria ? { categoria: i.categoria } : {}) },
    });
    rev();
    return { id: i.id };
  },
);

export const excluirHabilidade = defineAction(
  { ...internos, acao: "excluir-habilidade", entidade: "Habilidade", schema: z.object({ id: z.string().min(1) }), entidadeId: (_d, i) => i.id },
  async (i, { user }) => {
    if (!(await gestorOuRh(user))) throw new ActionError("Sem permissão para excluir competência.");
    await prisma.habilidade.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

/** Vincula/desvincula habilidade de um usuário (atalho da matriz de Recursos, sem nível). */
export const alternarHabilidadeUsuario = defineAction(
  {
    ...base,
    acao: "toggle-habilidade",
    entidade: "UserHabilidade",
    schema: z.object({ userId: z.string().min(1), habilidadeId: z.string().min(1) }),
  },
  async (i) => {
    const existente = await prisma.userHabilidade.findUnique({
      where: { userId_habilidadeId: { userId: i.userId, habilidadeId: i.habilidadeId } },
    });
    if (existente) await prisma.userHabilidade.delete({ where: { id: existente.id } });
    else await prisma.userHabilidade.create({ data: { userId: i.userId, habilidadeId: i.habilidadeId } });
    rev(i.userId);
    return { ativo: !existente };
  },
);

/**
 * A pessoa declara o próprio nível numa competência publicada. Declarar de novo (ou mudar o
 * nível) tira a validação: o coordenador confere outra vez.
 */
export const declararMeuNivel = defineAction(
  {
    ...internos,
    acao: "declarar-nivel-habilidade",
    entidade: "UserHabilidade",
    schema: z.object({ habilidadeId: z.string().min(1), nivel, observacao: z.string().trim().max(300).nullable().optional() }),
  },
  async (i, { user }) => {
    const h = await prisma.habilidade.findUnique({ where: { id: i.habilidadeId }, select: { publicada: true } });
    if (!h) throw new ActionError("Competência não encontrada.");
    if (!h.publicada) throw new ActionError(MOTIVO_NAO_PUBLICADA);
    const dados = { nivel: i.nivel, observacao: i.observacao?.trim() || null, declaradoEm: new Date(), validadoEm: null, validadoPorId: null };
    await prisma.userHabilidade.upsert({
      where: { userId_habilidadeId: { userId: user.id, habilidadeId: i.habilidadeId } },
      create: { userId: user.id, habilidadeId: i.habilidadeId, ...dados },
      update: dados,
    });
    rev(user.id);
    return { ok: true };
  },
);

/** A pessoa tira uma competência da própria lista. */
export const removerMinhaHabilidade = defineAction(
  { ...internos, acao: "remover-minha-habilidade", entidade: "UserHabilidade", schema: z.object({ habilidadeId: z.string().min(1) }) },
  async (i, { user }) => {
    await prisma.userHabilidade.deleteMany({ where: { userId: user.id, habilidadeId: i.habilidadeId } });
    rev(user.id);
    return { ok: true };
  },
);

/**
 * Coordenação/RH define o nível de alguém e, se quiser, já valida. Nunca sobre si mesmo
 * (`motivoParaNaoValidar`): o próprio nível só se declara.
 */
export const definirNivelPessoa = defineAction(
  {
    ...internos,
    acao: "definir-nivel-habilidade",
    entidade: "UserHabilidade",
    schema: z.object({
      userId: z.string().min(1),
      habilidadeId: z.string().min(1),
      nivel: nivel.nullable(),
      validar: z.boolean(),
      observacao: z.string().trim().max(300).nullable().optional(),
    }),
    capturarAntes: (i) =>
      prisma.userHabilidade.findUnique({ where: { userId_habilidadeId: { userId: i.userId, habilidadeId: i.habilidadeId } } }),
  },
  async (i, { user }) => {
    if (!(await gestorOuRh(user))) throw new ActionError("Sem permissão para definir nível.");
    if (i.validar) {
      const motivo = motivoParaNaoValidar(i.userId, user.id, i.nivel);
      if (motivo) throw new ActionError(motivo);
    } else if (i.userId === user.id) {
      throw new ActionError("O próprio nível se declara em Minha conta.");
    }
    const dados = {
      nivel: i.nivel,
      ...(i.observacao !== undefined ? { observacao: i.observacao?.trim() || null } : {}),
      validadoEm: i.validar ? new Date() : null,
      validadoPorId: i.validar ? user.id : null,
    };
    await prisma.userHabilidade.upsert({
      where: { userId_habilidadeId: { userId: i.userId, habilidadeId: i.habilidadeId } },
      create: { userId: i.userId, habilidadeId: i.habilidadeId, declaradoEm: new Date(), ...dados },
      update: dados,
    });
    rev(i.userId);
    return { ok: true };
  },
);

// ── Necessidade por projeto ──────────────────────────────────

export const salvarNecessidade = defineAction(
  {
    ...base,
    acao: "salvar-necessidade-habilidade",
    entidade: "NecessidadeHabilidade",
    schema: z.object({
      projetoId: z.string().min(1),
      habilidadeId: z.string().min(1, "Escolha a competência."),
      nivelMinimo: nivel,
      observacao: z.string().trim().max(300).nullable().optional(),
    }),
  },
  async (i) => {
    const r = await prisma.necessidadeHabilidade.upsert({
      where: { projetoId_habilidadeId: { projetoId: i.projetoId, habilidadeId: i.habilidadeId } },
      create: { projetoId: i.projetoId, habilidadeId: i.habilidadeId, nivelMinimo: i.nivelMinimo, observacao: i.observacao || null },
      update: { nivelMinimo: i.nivelMinimo, observacao: i.observacao || null },
      select: { id: true },
    });
    rev();
    return r;
  },
);

export const removerNecessidade = defineAction(
  { ...base, acao: "remover-necessidade-habilidade", entidade: "NecessidadeHabilidade", schema: z.object({ id: z.string().min(1) }), entidadeId: (_d, i) => i.id },
  async (i) => {
    await prisma.necessidadeHabilidade.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
