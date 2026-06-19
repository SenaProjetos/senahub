"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { registrarHistorico } from "../historico";

const base = { modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir" } as const;
const revConfig = () => revalidatePath("/configuracoes/habilitacao");
const rev = () => revalidatePath("/licitacoes");

// ── salvarChecklistModelo (upsert com replace-all dos itens) ──
export const salvarChecklistModelo = defineAction(
  {
    ...base,
    acao: "salvar-checklist-modelo",
    entidade: "ChecklistHabilitacaoModelo",
    schema: z.object({
      id: z.string().optional(),
      nome: z.string().min(1),
      ativo: z.boolean().optional(),
      ordem: z.number().int().optional(),
      itens: z
        .array(
          z.object({
            exigencia: z.string().min(1),
            obrigatorio: z.boolean().optional(),
          }),
        )
        .max(200),
    }),
  },
  async (i) => {
    await prisma.$transaction(async (tx) => {
      const modelo = i.id
        ? await tx.checklistHabilitacaoModelo.update({
            where: { id: i.id },
            data: { nome: i.nome, ativo: i.ativo ?? true, ordem: i.ordem ?? 0 },
          })
        : await tx.checklistHabilitacaoModelo.create({
            data: { nome: i.nome, ativo: i.ativo ?? true, ordem: i.ordem ?? 0 },
          });
      await tx.checklistHabilitacaoModeloItem.deleteMany({ where: { modeloId: modelo.id } });
      if (i.itens.length > 0) {
        await tx.checklistHabilitacaoModeloItem.createMany({
          data: i.itens.map((it, n) => ({
            modeloId: modelo.id,
            exigencia: it.exigencia,
            obrigatorio: it.obrigatorio ?? true,
            ordem: n,
          })),
        });
      }
      return { id: modelo.id };
    });
    revConfig();
    return { ok: true };
  },
);

// ── excluirChecklistModelo ────────────────────────────────────
export const excluirChecklistModelo = defineAction(
  {
    ...base,
    acao: "excluir-checklist-modelo",
    entidade: "ChecklistHabilitacaoModelo",
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i) => {
    await prisma.checklistHabilitacaoModelo.delete({ where: { id: i.id } });
    revConfig();
    return { id: i.id };
  },
);

// ── semearHabilitacao ─────────────────────────────────────────
export const semearHabilitacao = defineAction(
  {
    ...base,
    acao: "semear-habilitacao",
    entidade: "LicitacaoHabilitacaoItem",
    schema: z.object({
      licitacaoId: z.string().min(1),
      modeloId: z.string().min(1),
    }),
  },
  async (i, { user }) => {
    const modelo = await prisma.checklistHabilitacaoModelo.findUnique({
      where: { id: i.modeloId },
      include: { itens: { orderBy: { ordem: "asc" } } },
    });
    if (!modelo) throw new ActionError("Modelo não encontrado.");
    const base0 = await prisma.licitacaoHabilitacaoItem.count({
      where: { licitacaoId: i.licitacaoId },
    });
    await prisma.$transaction(async (tx) => {
      if (modelo.itens.length > 0) {
        await tx.licitacaoHabilitacaoItem.createMany({
          data: modelo.itens.map((it, n) => ({
            licitacaoId: i.licitacaoId,
            exigencia: it.exigencia,
            obrigatorio: it.obrigatorio,
            ordem: base0 + n,
          })),
        });
      }
      await registrarHistorico(
        tx,
        i.licitacaoId,
        `Checklist de habilitação semeado do modelo "${modelo.nome}".`,
        user.id,
      );
    });
    rev();
    return { ok: true };
  },
);

// ── salvarHabilitacao (replace-all dos itens da licitação) ────
export const salvarHabilitacao = defineAction(
  {
    ...base,
    acao: "salvar-habilitacao",
    entidade: "LicitacaoHabilitacaoItem",
    schema: z.object({
      licitacaoId: z.string().min(1),
      itens: z
        .array(
          z.object({
            exigencia: z.string().min(1),
            certidaoId: z.string().optional().or(z.literal("")),
            atendido: z.boolean().optional(),
            obrigatorio: z.boolean().optional(),
            observacao: z.string().optional().or(z.literal("")),
          }),
        )
        .max(200),
    }),
  },
  async (i) => {
    await prisma.$transaction(async (tx) => {
      await tx.licitacaoHabilitacaoItem.deleteMany({ where: { licitacaoId: i.licitacaoId } });
      if (i.itens.length > 0) {
        await tx.licitacaoHabilitacaoItem.createMany({
          data: i.itens.map((it, n) => ({
            licitacaoId: i.licitacaoId,
            exigencia: it.exigencia,
            certidaoId: it.certidaoId || null,
            atendido: it.atendido ?? false,
            obrigatorio: it.obrigatorio ?? true,
            observacao: it.observacao || null,
            ordem: n,
          })),
        });
      }
    });
    rev();
    return { ok: true };
  },
);
