"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const base = { modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir" } as const;
const rev = () => revalidatePath("/licitacoes");

// ── E4 Histórico da licitação ─────────────────────────────────
export const registrarEventoLicitacao = defineAction(
  { ...base, acao: "registrar-evento-licitacao", entidade: "LicitacaoHistorico", schema: z.object({ licitacaoId: z.string().min(1), descricao: z.string().min(1, "Descreva o evento.") }) },
  async (i, ctx) => {
    await prisma.licitacaoHistorico.create({ data: { licitacaoId: i.licitacaoId, descricao: i.descricao, autorId: ctx.user.id } });
    rev();
    return { ok: true };
  },
);

// ── E5 Valor por disciplina ───────────────────────────────────
export const salvarValorDisciplinaLicitacao = defineAction(
  { ...base, acao: "salvar-valor-disc-licitacao", entidade: "DisciplinaValorLicitacao", schema: z.object({ licitacaoId: z.string().min(1), disciplina: z.string().min(1, "Informe a disciplina."), valor: z.number().min(0) }) },
  async (i) => {
    await prisma.disciplinaValorLicitacao.create({ data: { licitacaoId: i.licitacaoId, disciplina: i.disciplina, valor: i.valor } });
    rev();
    return { ok: true };
  },
);

export const removerValorDisciplinaLicitacao = defineAction(
  { ...base, acao: "remover-valor-disc-licitacao", entidade: "DisciplinaValorLicitacao", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const v = await prisma.disciplinaValorLicitacao.findUnique({ where: { id: i.id }, select: { id: true } });
    if (!v) throw new ActionError("Item não encontrado.");
    await prisma.disciplinaValorLicitacao.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
