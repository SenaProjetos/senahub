"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { INTERNAL_ROLES } from "@/lib/roles";

const gerir = { modulo: "projetos", recurso: "projetos", permissao: "gerir" } as const;
const rev = (projetoId: string) => revalidatePath(`/projetos/${projetoId}/extras`);

async function projetoDaDisciplina(disciplinaId: string): Promise<string> {
  const d = await prisma.disciplina.findUnique({ where: { id: disciplinaId }, select: { projetoId: true } });
  if (!d) throw new ActionError("Disciplina não encontrada.");
  return d.projetoId;
}

// ── B2 Solicitação de revisão ─────────────────────────────────
export const solicitarRevisao = defineAction(
  {
    modulo: "projetos",
    roles: INTERNAL_ROLES,
    acao: "solicitar-revisao",
    entidade: "SolicitacaoRevisao",
    schema: z.object({ disciplinaId: z.string().min(1), motivo: z.string().min(1, "Descreva o motivo.") }),
  },
  async (i, ctx) => {
    const projetoId = await projetoDaDisciplina(i.disciplinaId);
    const s = await prisma.solicitacaoRevisao.create({
      data: { disciplinaId: i.disciplinaId, solicitanteId: ctx.user.id, motivo: i.motivo },
    });
    rev(projetoId);
    return { id: s.id };
  },
);

export const responderRevisao = defineAction(
  {
    ...gerir,
    acao: "responder-revisao",
    entidade: "SolicitacaoRevisao",
    schema: z.object({ id: z.string().min(1), aceitar: z.boolean(), respostaMotivo: z.string().optional().or(z.literal("")) }),
  },
  async (i) => {
    const s = await prisma.solicitacaoRevisao.findUnique({ where: { id: i.id }, include: { disciplina: { select: { projetoId: true } } } });
    if (!s) throw new ActionError("Solicitação não encontrada.");
    await prisma.solicitacaoRevisao.update({
      where: { id: i.id },
      data: { status: i.aceitar ? "aceita" : "recusada", respostaMotivo: i.respostaMotivo || null, respondidoEm: new Date() },
    });
    rev(s.disciplina.projetoId);
    return { id: i.id };
  },
);

// ── B3 Composição de preço ────────────────────────────────────
export const salvarComposicaoPreco = defineAction(
  {
    ...gerir,
    acao: "salvar-composicao",
    entidade: "ProjetoComposicaoPreco",
    schema: z.object({
      projetoId: z.string().min(1),
      observacao: z.string().optional().or(z.literal("")),
      itens: z.array(z.object({ descricao: z.string().min(1), quantidade: z.number().min(0), valorUnitario: z.number().min(0) })).max(200),
    }),
  },
  async (i) => {
    await prisma.$transaction(async (tx) => {
      const comp = await tx.projetoComposicaoPreco.upsert({
        where: { projetoId: i.projetoId },
        create: { projetoId: i.projetoId, observacao: i.observacao || null },
        update: { observacao: i.observacao || null },
      });
      await tx.itemComposicaoPreco.deleteMany({ where: { composicaoId: comp.id } });
      if (i.itens.length > 0) {
        await tx.itemComposicaoPreco.createMany({
          data: i.itens.map((it, n) => ({ composicaoId: comp.id, descricao: it.descricao, quantidade: it.quantidade, valorUnitario: it.valorUnitario, ordem: n })),
        });
      }
    });
    rev(i.projetoId);
    return { ok: true };
  },
);

// ── B4 Configuração de LM (BIM) ───────────────────────────────
export const salvarLmConfig = defineAction(
  { ...gerir, acao: "salvar-lm-config", entidade: "LmConfig", schema: z.object({ projetoId: z.string().min(1), conteudo: z.string() }) },
  async (i) => {
    await prisma.lmConfig.upsert({
      where: { projetoId: i.projetoId },
      create: { projetoId: i.projetoId, conteudo: i.conteudo },
      update: { conteudo: i.conteudo },
    });
    rev(i.projetoId);
    return { ok: true };
  },
);

// ── B5 Linha de base do cronograma ────────────────────────────
export const salvarLinhaBase = defineAction(
  { ...gerir, acao: "salvar-linha-base", entidade: "LinhaBase", schema: z.object({ projetoId: z.string().min(1), nome: z.string().min(1, "Informe um nome.") }) },
  async (i) => {
    const tarefas = await prisma.eapTarefa.findMany({
      where: { projetoId: i.projetoId },
      select: { id: true, nome: true, inicioPrevisto: true, fimPrevisto: true },
    });
    if (tarefas.length === 0) throw new ActionError("Projeto sem tarefas de EAP para fotografar.");
    const snapshot = tarefas.map((t) => ({
      id: t.id,
      nome: t.nome,
      inicio: t.inicioPrevisto.toISOString().slice(0, 10),
      fim: t.fimPrevisto.toISOString().slice(0, 10),
    }));
    const lb = await prisma.linhaBase.create({ data: { projetoId: i.projetoId, nome: i.nome, snapshot } });
    rev(i.projetoId);
    return { id: lb.id, tarefas: snapshot.length };
  },
);

export const excluirLinhaBase = defineAction(
  { ...gerir, acao: "excluir-linha-base", entidade: "LinhaBase", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const lb = await prisma.linhaBase.findUnique({ where: { id: i.id }, select: { projetoId: true } });
    if (!lb) throw new ActionError("Linha de base não encontrada.");
    await prisma.linhaBase.delete({ where: { id: i.id } });
    rev(lb.projetoId);
    return { id: i.id };
  },
);
