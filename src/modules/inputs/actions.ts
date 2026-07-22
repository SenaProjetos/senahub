"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { calcularStatusBriefing } from "@/modules/inputs/briefing-schema";
import {
  adicionarInputSchema,
  removerInputSchema,
  responderInputsSchema,
  gerarLinkSchema,
} from "@/modules/inputs/schemas";

const projBase = { modulo: "projetos", recurso: "projetos", permissao: "gerir" } as const;
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

/** Cria, no projeto, os inputs padrão (InputTemplate) das disciplinas dele — sem duplicar. */
async function aplicarInputsPadraoCore(projetoId: string): Promise<number> {
  const [proj, existentes, templates] = await Promise.all([
    prisma.projeto.findUnique({ where: { id: projetoId }, select: { disciplinas: { select: { nome: true } } } }),
    prisma.inputProjeto.findMany({ where: { projetoId }, select: { disciplina: true, pergunta: true } }),
    prisma.inputTemplate.findMany({ where: { ativo: true }, orderBy: [{ disciplina: "asc" }, { ordem: "asc" }] }),
  ]);
  if (!proj) return 0;
  const discs = new Set(proj.disciplinas.map((d) => d.nome));
  const jaTem = new Set(existentes.map((e) => `${e.disciplina ?? ""}|${e.pergunta}`));
  const novos = templates.filter(
    (t) => (t.disciplina == null || discs.has(t.disciplina)) && !jaTem.has(`${t.disciplina ?? ""}|${t.pergunta}`),
  );
  if (novos.length === 0) return 0;
  await prisma.inputProjeto.createMany({
    data: novos.map((t) => ({ projetoId, disciplina: t.disciplina, pergunta: t.pergunta, ordem: t.ordem })),
  });
  return novos.length;
}

export const adicionarInput = defineAction(
  {
    modulo: "projetos",
    acao: "adicionar-input",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "InputProjeto",
    schema: adicionarInputSchema,
    entidadeId: (_d, i) => (i as { projetoId: string }).projetoId,
  },
  async (input) => {
    const ordem = await prisma.inputProjeto.count({ where: { projetoId: input.projetoId } });
    const item = await prisma.inputProjeto.create({
      data: {
        projetoId: input.projetoId,
        disciplina: input.disciplina || null,
        pergunta: input.pergunta,
        ordem,
      },
    });
    revalidatePath(`/projetos/${input.projetoId}`);
    return { id: item.id };
  },
);

export const removerInput = defineAction(
  {
    modulo: "projetos",
    acao: "remover-input",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "InputProjeto",
    schema: removerInputSchema,
    // Correlação no histórico pelo projeto (o input é deletado — id sai do id-set).
    entidadeId: (d) => (d as { projetoId: string }).projetoId,
  },
  async (input) => {
    const item = await prisma.inputProjeto.delete({ where: { id: input.id } });
    revalidatePath(`/projetos/${item.projetoId}`);
    return { id: input.id, projetoId: item.projetoId };
  },
);

/** Admin edita respostas após o preenchimento do cliente. */
export const responderInputs = defineAction(
  {
    modulo: "projetos",
    acao: "responder-inputs",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "InputProjeto",
    schema: responderInputsSchema,
    entidadeId: (d, i) => ((d ?? i) as { projetoId: string }).projetoId,
  },
  async (input) => {
    await prisma.$transaction(
      input.respostas.map((r) =>
        prisma.inputProjeto.update({ where: { id: r.id }, data: { resposta: r.resposta || null } }),
      ),
    );
    revalidatePath(`/projetos/${input.projetoId}`);
    return { projetoId: input.projetoId };
  },
);

/** Salva (upsert) as respostas do briefing de Start e recalcula o status. */
export const salvarBriefing = defineAction(
  {
    modulo: "projetos",
    acao: "salvar-briefing",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "BriefingProjeto",
    schema: z.object({
      projetoId: z.string().min(1),
      respostas: z.record(z.string(), z.unknown()).default({}),
    }),
    entidadeId: (d, i) => ((d ?? i) as { projetoId: string }).projetoId,
  },
  async (input, { user }) => {
    const status = calcularStatusBriefing(input.respostas);
    const respostasJson = input.respostas as unknown as Prisma.InputJsonValue;
    await prisma.briefingProjeto.upsert({
      where: { projetoId: input.projetoId },
      create: { projetoId: input.projetoId, respostasJson, status, preenchidoPor: user.name, preenchidoEm: new Date() },
      update: { respostasJson, status, preenchidoPor: user.name, preenchidoEm: new Date() },
    });
    revalidatePath(`/projetos/${input.projetoId}`);
    return { projetoId: input.projetoId, status };
  },
);

/** Gera (ou regenera) o link público de inputs do projeto. */
export const gerarLinkInput = defineAction(
  {
    modulo: "projetos",
    acao: "gerar-link-input",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "LinkPublicoInput",
    schema: gerarLinkSchema,
    entidadeId: (d, i) => ((d ?? i) as { projetoId: string }).projetoId,
  },
  async (input) => {
    // Garante que os inputs padrão das disciplinas estejam no projeto antes de liberar o link.
    await aplicarInputsPadraoCore(input.projetoId);
    const token = randomBytes(18).toString("hex");
    await prisma.linkPublicoInput.upsert({
      where: { projetoId: input.projetoId },
      create: { projetoId: input.projetoId, token, ativo: true },
      update: { token, ativo: true },
    });
    revalidatePath(`/projetos/${input.projetoId}`);
    return { projetoId: input.projetoId, token };
  },
);

// ── Inputs padrão por disciplina (#3) ─────────────────────────
export const aplicarInputsPadrao = defineAction(
  { ...projBase, acao: "aplicar-inputs-padrao", entidade: "InputProjeto", schema: z.object({ projetoId: z.string().min(1) }), entidadeId: (_d, i) => (i as { projetoId: string }).projetoId },
  async (i) => {
    const criados = await aplicarInputsPadraoCore(i.projetoId);
    revalidatePath(`/projetos/${i.projetoId}`);
    return { criados };
  },
);

const templateSchema = z.object({
  disciplina: opt(z.string()),
  pergunta: z.string().min(1, "Informe a pergunta."),
  ordem: z.number().int().min(0).optional(),
});

export const criarInputTemplate = defineAction(
  { ...projBase, acao: "criar-input-template", entidade: "InputTemplate", schema: templateSchema },
  async (i) => {
    const t = await prisma.inputTemplate.create({
      data: { disciplina: i.disciplina || null, pergunta: i.pergunta, ordem: i.ordem ?? 0 },
    });
    revalidatePath("/configuracoes/inputs");
    return { id: t.id };
  },
);

export const editarInputTemplate = defineAction(
  { ...projBase, acao: "editar-input-template", entidade: "InputTemplate", schema: templateSchema.extend({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.inputTemplate.update({
      where: { id: i.id },
      data: { disciplina: i.disciplina || null, pergunta: i.pergunta, ordem: i.ordem ?? 0 },
    });
    revalidatePath("/configuracoes/inputs");
    return { id: i.id };
  },
);

export const excluirInputTemplate = defineAction(
  { ...projBase, acao: "excluir-input-template", entidade: "InputTemplate", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.inputTemplate.delete({ where: { id: i.id } });
    revalidatePath("/configuracoes/inputs");
    return { id: i.id };
  },
);
