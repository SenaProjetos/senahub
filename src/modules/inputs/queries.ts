import "server-only";
import { prisma } from "@/lib/prisma";
import { linkVigente } from "@/lib/link-publico";

/** Templates de inputs padrão (catálogo por disciplina). */
export async function listarInputTemplates() {
  return prisma.inputTemplate.findMany({ orderBy: [{ disciplina: "asc" }, { ordem: "asc" }] });
}

/** Perguntas extras ATIVAS do projeto (as removidas ficam fora da tela e do link). */
export async function listarInputs(projetoId: string) {
  return prisma.inputProjeto.findMany({
    where: { projetoId, removidoEm: null },
    orderBy: [{ disciplina: "asc" }, { ordem: "asc" }, { createdAt: "asc" }],
  });
}

/** Perguntas extras removidas do formulário — para restaurar. */
export async function listarInputsRemovidos(projetoId: string) {
  return prisma.inputProjeto.findMany({
    where: { projetoId, removidoEm: { not: null } },
    orderBy: { removidoEm: "desc" },
    select: { id: true, disciplina: true, pergunta: true, resposta: true, removidoEm: true },
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
    prisma.inputProjeto.count({ where: { projetoId, removidoEm: null } }),
    prisma.inputProjeto.count({ where: { projetoId, removidoEm: null, NOT: { resposta: null } } }),
  ]);
  return { total, respondidas };
}

/** Carrega o projeto + inputs + briefing pelo token público (só link vigente). */
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
          inputs: {
            where: { removidoEm: null },
            orderBy: [{ disciplina: "asc" }, { ordem: "asc" }, { createdAt: "asc" }],
          },
          disciplinas: { select: { disciplinaTextoLegado: true } },
          briefing: { select: { respostasJson: true, status: true, secoesOcultas: true, camposOcultos: true } },
          cliente: { select: { nome: true, email: true, telefone: true } },
        },
      },
    },
  });
  if (!link || !linkVigente(link)) return null;
  return link.projeto;
}

export type InputItem = Awaited<ReturnType<typeof listarInputs>>[number];
