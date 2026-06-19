"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { registrarHistorico } from "../historico";

const base = { modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir" } as const;
const rev = () => revalidatePath("/licitacoes");

// ── salvarViabilidade (upsert; NÃO mexe em decisao/decididoPor) ───────────────
export const salvarViabilidade = defineAction(
  {
    ...base,
    acao: "salvar-viabilidade",
    entidade: "ViabilidadeLicitacao",
    schema: z.object({
      licitacaoId: z.string().min(1),
      modo: z.enum(["fixo", "configuravel"]),
      margemEsperadaPct: z.number().optional(),
      equipeDisponivel: z.boolean().optional(),
      concorrenciaPrevista: z.string().optional().or(z.literal("")),
      criterios: z
        .array(
          z.object({
            criterio: z.string().min(1),
            atendido: z.boolean().optional(),
            observacao: z.string().optional().or(z.literal("")),
          }),
        )
        .max(200)
        .optional(),
    }),
  },
  async (i) => {
    await prisma.$transaction(async (tx) => {
      const v = await tx.viabilidadeLicitacao.upsert({
        where: { licitacaoId: i.licitacaoId },
        create: {
          licitacaoId: i.licitacaoId,
          modo: i.modo,
          margemEsperadaPct: i.margemEsperadaPct ?? null,
          equipeDisponivel: i.equipeDisponivel ?? null,
          concorrenciaPrevista: i.concorrenciaPrevista || null,
        },
        update: {
          modo: i.modo,
          margemEsperadaPct: i.margemEsperadaPct ?? null,
          equipeDisponivel: i.equipeDisponivel ?? null,
          concorrenciaPrevista: i.concorrenciaPrevista || null,
        },
      });
      await tx.viabilidadeCriterio.deleteMany({ where: { viabilidadeId: v.id } });
      const crits = i.criterios ?? [];
      if (crits.length > 0) {
        await tx.viabilidadeCriterio.createMany({
          data: crits.map((c, n) => ({
            viabilidadeId: v.id,
            criterio: c.criterio,
            atendido: c.atendido ?? false,
            observacao: c.observacao || null,
            ordem: n,
          })),
        });
      }
    });
    rev();
    return { ok: true };
  },
);

// ── decidirViabilidade (GATE SÓCIO) ──────────────────────────────────────────
export const decidirViabilidade = defineAction(
  {
    ...base,
    acao: "decidir-viabilidade",
    entidade: "ViabilidadeLicitacao",
    schema: z.object({
      licitacaoId: z.string().min(1),
      decisao: z.enum(["go", "no_go", "pendente"]),
      justificativa: z.string().optional().or(z.literal("")),
    }),
  },
  async (i, { user }) => {
    // Gate: somente sócio ativo OU admin
    const ehAdmin = user.role === "admin";
    const socio = ehAdmin
      ? null
      : await prisma.socio.findFirst({
          where: { userId: user.id, ativo: true },
          select: { id: true },
        });
    if (!ehAdmin && !socio) throw new ActionError("Apenas sócios podem registrar a decisão go/no-go.");

    const decidido = i.decisao === "pendente" ? null : new Date();
    await prisma.$transaction(async (tx) => {
      await tx.viabilidadeLicitacao.upsert({
        where: { licitacaoId: i.licitacaoId },
        create: {
          licitacaoId: i.licitacaoId,
          decisao: i.decisao,
          decididoPorId: decidido ? user.id : null,
          decididoEm: decidido,
          justificativa: i.justificativa || null,
        },
        update: {
          decisao: i.decisao,
          decididoPorId: decidido ? user.id : null,
          decididoEm: decidido,
          justificativa: i.justificativa || null,
        },
      });
      const txt =
        i.decisao === "go"
          ? "Viabilidade: GO aprovado."
          : i.decisao === "no_go"
            ? "Viabilidade: NO-GO."
            : "Viabilidade: decisão revertida a pendente.";
      await registrarHistorico(tx, i.licitacaoId, txt, user.id);
    });
    rev();
    return { ok: true };
  },
);
