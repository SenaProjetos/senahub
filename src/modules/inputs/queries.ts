import "server-only";
import { prisma } from "@/lib/prisma";

/** Templates de inputs padrão (catálogo por disciplina). */
export async function listarInputTemplates() {
  return prisma.inputTemplate.findMany({ orderBy: [{ disciplina: "asc" }, { ordem: "asc" }] });
}

export async function listarInputs(projetoId: string) {
  return prisma.inputProjeto.findMany({
    where: { projetoId },
    orderBy: [{ disciplina: "asc" }, { ordem: "asc" }, { createdAt: "asc" }],
  });
}

export async function linkInput(projetoId: string) {
  return prisma.linkPublicoInput.findUnique({ where: { projetoId } });
}

/** Briefing de Start do projeto (ou null se ainda não iniciado). */
export async function obterBriefing(projetoId: string) {
  return prisma.briefingProjeto.findUnique({ where: { projetoId } });
}

/** Progresso de preenchimento (respondidas / total). */
export async function progressoInputs(projetoId: string) {
  const [total, respondidas] = await Promise.all([
    prisma.inputProjeto.count({ where: { projetoId } }),
    prisma.inputProjeto.count({ where: { projetoId, NOT: { resposta: null } } }),
  ]);
  return { total, respondidas };
}

/** Carrega o projeto + inputs + briefing pelo token público (somente links ativos). */
export async function inputsPorToken(token: string) {
  const link = await prisma.linkPublicoInput.findUnique({
    where: { token },
    include: {
      projeto: {
        select: {
          id: true,
          nome: true,
          codigo: true,
          endereco: true,
          inputs: { orderBy: [{ disciplina: "asc" }, { ordem: "asc" }, { createdAt: "asc" }] },
          disciplinas: { select: { nome: true } },
          briefing: { select: { respostasJson: true, status: true } },
          cliente: { select: { nome: true, email: true, telefone: true } },
        },
      },
    },
  });
  if (!link || !link.ativo) return null;
  return link.projeto;
}

export type InputItem = Awaited<ReturnType<typeof listarInputs>>[number];
