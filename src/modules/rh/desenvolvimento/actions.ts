"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";

import type { SessionUser } from "@/lib/session";
import { CADENCIA_MAX, CADENCIA_MIN, MOTIVO_JA_E_LIDER, MOTIVO_LIDERAR_A_SI, MOTIVO_SEM_ACESSO, papelSobre, podeEscrever } from "./regras";

const internos = { modulo: "rh", interno: true } as const;
const rhBase = { modulo: "rh", gereRh: true } as const;
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const dia = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);
const texto = (max: number) => z.string().trim().max(max, `No máximo ${max} caracteres.`).nullable().optional();

function rev(userId: string) {
  revalidatePath(`/rh/pessoas/${userId}`);
  revalidatePath("/rh/minha-equipe");
  revalidatePath(`/rh/minha-equipe/${userId}`);
  revalidatePath("/minha-ficha");
}

/** RH ou o líder ATIVO da pessoa — quem escreve no desenvolvimento dela. Devolve o líder ativo. */
async function exigirEscrita(user: SessionUser, userId: string) {
  const ativa = await prisma.liderancaPessoa.findFirst({ where: { userId, fim: null }, select: { liderId: true } });
  const papel = papelSobre({ id: user.id, ehRh: user.gereRh }, userId, ativa?.liderId ?? null);
  if (!podeEscrever(papel)) throw new ActionError(MOTIVO_SEM_ACESSO);
  return ativa?.liderId ?? null;
}

// ── Liderança (RH) ───────────────────────────────────────────

/** Define (ou troca) a liderança direta: encerra a ativa hoje e abre a nova. O histórico fica. */
export const definirLideranca = defineAction(
  {
    ...rhBase,
    acao: "definir-lideranca",
    entidade: "LiderancaPessoa",
    schema: z.object({ userId: z.string().min(1), liderId: z.string().min(1, "Escolha a liderança.") }),
    entidadeId: (_d, i) => i.userId,
  },
  async (i, { user }) => {
    if (i.userId === i.liderId) throw new ActionError(MOTIVO_LIDERAR_A_SI);
    const ativa = await prisma.liderancaPessoa.findFirst({ where: { userId: i.userId, fim: null }, select: { id: true, liderId: true } });
    if (ativa?.liderId === i.liderId) throw new ActionError(MOTIVO_JA_E_LIDER);
    const hoje = dia(diaDeSaoPaulo())!;
    try {
      await prisma.$transaction(async (tx) => {
        if (ativa) await tx.liderancaPessoa.update({ where: { id: ativa.id }, data: { fim: hoje } });
        await tx.liderancaPessoa.create({ data: { userId: i.userId, liderId: i.liderId, inicio: hoje, criadoPorId: user.id } });
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw new ActionError("A liderança mudou enquanto você salvava. Recarregue a página.");
      throw e;
    }
    rev(i.userId);
    return { ok: true };
  },
);

export const encerrarLideranca = defineAction(
  { ...rhBase, acao: "encerrar-lideranca", entidade: "LiderancaPessoa", schema: z.object({ userId: z.string().min(1) }), entidadeId: (_d, i) => i.userId },
  async (i) => {
    const r = await prisma.liderancaPessoa.updateMany({ where: { userId: i.userId, fim: null }, data: { fim: dia(diaDeSaoPaulo())! } });
    if (r.count === 0) throw new ActionError("Esta pessoa não tem liderança ativa.");
    rev(i.userId);
    return { ok: true };
  },
);

/** Cadência do 1:1 — RH ou o líder (decisão: mensal por padrão, o líder pode mudar). */
export const definirCadencia = defineAction(
  {
    ...internos,
    acao: "definir-cadencia-1a1",
    entidade: "LiderancaPessoa",
    schema: z.object({
      userId: z.string().min(1),
      cadenciaDias: z.number().int().min(CADENCIA_MIN, `Entre ${CADENCIA_MIN} e ${CADENCIA_MAX} dias.`).max(CADENCIA_MAX, `Entre ${CADENCIA_MIN} e ${CADENCIA_MAX} dias.`),
    }),
    entidadeId: (_d, i) => i.userId,
  },
  async (i, { user }) => {
    await exigirEscrita(user, i.userId);
    const r = await prisma.liderancaPessoa.updateMany({ where: { userId: i.userId, fim: null }, data: { cadenciaDias: i.cadenciaDias } });
    if (r.count === 0) throw new ActionError("Esta pessoa não tem liderança ativa.");
    rev(i.userId);
    return { ok: true };
  },
);

// ── Objetivos ────────────────────────────────────────────────

export const salvarObjetivo = defineAction(
  {
    ...internos,
    acao: "salvar-objetivo-desenvolvimento",
    entidade: "ObjetivoDesenvolvimento",
    schema: z.object({
      id: z.string().min(1).optional(),
      userId: z.string().min(1),
      titulo: z.string().trim().min(1, "Dê um título ao objetivo.").max(200),
      resultadoEsperado: texto(1000),
      alvo: dataIso.nullable().optional(),
      habilidadeId: z.string().min(1).nullable().optional(),
    }),
    entidadeId: (d) => (d as { id: string }).id,
    capturarAntes: async (i) => (i.id ? prisma.objetivoDesenvolvimento.findUnique({ where: { id: i.id } }) : null),
  },
  async (i, { user }) => {
    await exigirEscrita(user, i.userId);
    const data = {
      titulo: i.titulo,
      resultadoEsperado: i.resultadoEsperado || null,
      alvo: dia(i.alvo),
      habilidadeId: i.habilidadeId || null,
    };
    if (i.id) {
      const r = await prisma.objetivoDesenvolvimento.updateMany({ where: { id: i.id, userId: i.userId }, data });
      if (r.count !== 1) throw new ActionError("Objetivo não encontrado.");
      rev(i.userId);
      return { id: i.id };
    }
    const o = await prisma.objetivoDesenvolvimento.create({ data: { ...data, userId: i.userId, criadoPorId: user.id }, select: { id: true } });
    rev(i.userId);
    return o;
  },
);

export const mudarStatusObjetivo = defineAction(
  {
    ...internos,
    acao: "status-objetivo-desenvolvimento",
    entidade: "ObjetivoDesenvolvimento",
    schema: z.object({ id: z.string().min(1), status: z.enum(["aberto", "concluido", "cancelado"]) }),
    entidadeId: (_d, i) => i.id,
    capturarAntes: (i) => prisma.objetivoDesenvolvimento.findUnique({ where: { id: i.id }, select: { status: true } }),
  },
  async (i, { user }) => {
    const o = await prisma.objetivoDesenvolvimento.findUnique({ where: { id: i.id }, select: { userId: true } });
    if (!o) throw new ActionError("Objetivo não encontrado.");
    await exigirEscrita(user, o.userId);
    await prisma.objetivoDesenvolvimento.update({
      where: { id: i.id },
      data: { status: i.status, concluidoEm: i.status === "concluido" ? new Date() : null },
    });
    rev(o.userId);
    return { id: i.id };
  },
);

// ── Encontros 1:1 ────────────────────────────────────────────

export const salvarEncontro = defineAction(
  {
    ...internos,
    acao: "salvar-encontro-1a1",
    entidade: "EncontroUmAUm",
    schema: z.object({
      id: z.string().min(1).optional(),
      userId: z.string().min(1),
      data: dataIso,
      pauta: texto(4000),
      decisoes: texto(4000),
      acoes: texto(4000),
      proximoEm: dataIso.nullable().optional(),
      visibilidade: z.enum(["lider_rh", "compartilhado"]),
    }),
    entidadeId: (d) => (d as { id: string }).id,
    capturarAntes: async (i) => (i.id ? prisma.encontroUmAUm.findUnique({ where: { id: i.id }, select: { visibilidade: true, data: true } }) : null),
  },
  async (i, { user }) => {
    const liderAtivo = await exigirEscrita(user, i.userId);
    if (i.proximoEm && i.proximoEm <= i.data) throw new ActionError("O próximo encontro precisa ser depois deste.", { proximoEm: "Depois da data do encontro." });
    const data = {
      data: dia(i.data)!,
      pauta: i.pauta || null,
      decisoes: i.decisoes || null,
      acoes: i.acoes || null,
      proximoEm: dia(i.proximoEm),
      visibilidade: i.visibilidade,
    };
    if (i.id) {
      const r = await prisma.encontroUmAUm.updateMany({ where: { id: i.id, userId: i.userId }, data });
      if (r.count !== 1) throw new ActionError("Encontro não encontrado.");
      rev(i.userId);
      return { id: i.id };
    }
    // Sem liderança ativa (RH registrando), o encontro fica no nome de quem registrou.
    const e = await prisma.encontroUmAUm.create({
      data: { ...data, userId: i.userId, liderId: liderAtivo ?? user.id, criadoPorId: user.id },
      select: { id: true },
    });
    // Encontro registrado: o lembrete de vencido volta a valer do zero.
    await prisma.liderancaPessoa.updateMany({ where: { userId: i.userId, fim: null }, data: { lembradoEm: null } });
    rev(i.userId);
    return e;
  },
);

export const excluirEncontro = defineAction(
  {
    ...internos,
    acao: "excluir-encontro-1a1",
    entidade: "EncontroUmAUm",
    schema: z.object({ id: z.string().min(1) }),
    entidadeId: (_d, i) => i.id,
    capturarAntes: (i) => prisma.encontroUmAUm.findUnique({ where: { id: i.id } }),
  },
  async (i, { user }) => {
    const e = await prisma.encontroUmAUm.findUnique({ where: { id: i.id }, select: { userId: true } });
    if (!e) throw new ActionError("Encontro não encontrado.");
    await exigirEscrita(user, e.userId);
    await prisma.encontroUmAUm.delete({ where: { id: i.id } });
    rev(e.userId);
    return { id: i.id };
  },
);
