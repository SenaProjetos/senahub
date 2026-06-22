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

// ── N-34: Checklist de projeto ──────────────────────────────────────────────

const checklistItemSchema = z.object({
  projetoId: z.string().min(1),
  descricao: z.string().min(1, "Informe a descrição."),
});

export const criarChecklistItem = defineAction(
  { ...gerir, acao: "criar-checklist-item", entidade: "Projeto", schema: checklistItemSchema },
  async (input) => {
    const max = await prisma.checklistItemProjeto.aggregate({
      where: { projetoId: input.projetoId },
      _max: { ordem: true },
    });
    const item = await prisma.checklistItemProjeto.create({
      data: { projetoId: input.projetoId, descricao: input.descricao, ordem: (max._max.ordem ?? 0) + 1 },
    });
    rev(input.projetoId);
    return { id: item.id };
  },
);

const toggleChecklistSchema = z.object({ itemId: z.string().min(1), concluido: z.boolean() });

export const toggleChecklistItem = defineAction(
  { ...gerir, acao: "toggle-checklist-item", entidade: "ChecklistItemProjeto", schema: toggleChecklistSchema, entidadeId: (d) => (d as { itemId: string }).itemId },
  async (input) => {
    const item = await prisma.checklistItemProjeto.findUnique({ where: { id: input.itemId }, select: { projetoId: true } });
    if (!item) throw new ActionError("Item não encontrado.");
    await prisma.checklistItemProjeto.update({
      where: { id: input.itemId },
      data: { concluido: input.concluido, concluidoEm: input.concluido ? new Date() : null },
    });
    rev(item.projetoId);
    return { itemId: input.itemId };
  },
);

const deleteChecklistSchema = z.object({ itemId: z.string().min(1) });

export const excluirChecklistItem = defineAction(
  { ...gerir, acao: "excluir-checklist-item", entidade: "ChecklistItemProjeto", schema: deleteChecklistSchema, entidadeId: (d) => (d as { itemId: string }).itemId },
  async (input) => {
    const item = await prisma.checklistItemProjeto.findUnique({ where: { id: input.itemId }, select: { projetoId: true } });
    if (!item) throw new ActionError("Item não encontrado.");
    await prisma.checklistItemProjeto.delete({ where: { id: input.itemId } });
    rev(item.projetoId);
    return { itemId: input.itemId };
  },
);

// ── N-39: Registro de riscos ────────────────────────────────────────────────

const criarRiscoSchema = z.object({
  projetoId: z.string().min(1),
  descricao: z.string().min(1, "Informe a descrição."),
  probabilidade: z.number().int().min(1).max(3).default(1),
  impacto: z.number().int().min(1).max(3).default(1),
  mitigacao: z.string().optional(),
});

export const criarRisco = defineAction(
  { ...gerir, acao: "criar-risco-projeto", entidade: "Projeto", schema: criarRiscoSchema },
  async (input) => {
    const risco = await prisma.riscoProjeto.create({
      data: {
        projetoId: input.projetoId,
        descricao: input.descricao,
        probabilidade: input.probabilidade,
        impacto: input.impacto,
        mitigacao: input.mitigacao,
      },
    });
    rev(input.projetoId);
    return { id: risco.id };
  },
);

const atualizarRiscoSchema = z.object({
  riscoId: z.string().min(1),
  status: z.enum(["aberto", "mitigado", "aceito"]),
  mitigacao: z.string().optional(),
});

export const atualizarRisco = defineAction(
  { ...gerir, acao: "atualizar-risco-projeto", entidade: "RiscoProjeto", schema: atualizarRiscoSchema, entidadeId: (d) => (d as { riscoId: string }).riscoId },
  async (input) => {
    const risco = await prisma.riscoProjeto.findUnique({ where: { id: input.riscoId }, select: { projetoId: true } });
    if (!risco) throw new ActionError("Risco não encontrado.");
    await prisma.riscoProjeto.update({
      where: { id: input.riscoId },
      data: { status: input.status, ...(input.mitigacao !== undefined ? { mitigacao: input.mitigacao } : {}) },
    });
    rev(risco.projetoId);
    return { riscoId: input.riscoId };
  },
);

const excluirRiscoSchema = z.object({ riscoId: z.string().min(1) });

export const excluirRisco = defineAction(
  { ...gerir, acao: "excluir-risco-projeto", entidade: "RiscoProjeto", schema: excluirRiscoSchema, entidadeId: (d) => (d as { riscoId: string }).riscoId },
  async (input) => {
    const risco = await prisma.riscoProjeto.findUnique({ where: { id: input.riscoId }, select: { projetoId: true } });
    if (!risco) throw new ActionError("Risco não encontrado.");
    await prisma.riscoProjeto.delete({ where: { id: input.riscoId } });
    rev(risco.projetoId);
    return { riscoId: input.riscoId };
  },
);
