import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { GLOBAL_ROLES, type Role } from "@/lib/roles";

type Viewer = { id: string; role: Role };

/**
 * Escopo de visibilidade das tarefas: admin/supervisor veem todas; os demais só veem
 * tarefas atribuídas a eles (responsável) OU que eles mesmos criaram.
 */
export function escopoTarefa(viewer: Viewer): Prisma.TarefaWhereInput {
  if (GLOBAL_ROLES.includes(viewer.role)) return {};
  return {
    OR: [
      { responsaveis: { some: { userId: viewer.id } } },
      { criadorId: viewer.id },
    ],
  };
}

/** Include compartilhado do formato "board" de tarefa (colunas e listas por disciplina). */
const includeTarefaBoard = {
  projeto: { select: { codigo: true, nome: true } },
  disciplina: { select: { id: true, nome: true } },
  responsaveis: { include: { user: { select: { id: true, name: true } } } },
  itens: { orderBy: { ordem: "asc" } },
  dependeDe: {
    include: {
      dependeDe: { select: { id: true, titulo: true, status: { select: { concluido: true } } } },
    },
  },
  comentarios: {
    orderBy: { createdAt: "asc" },
    include: { autor: { select: { name: true } } },
  },
} satisfies Prisma.TarefaInclude;

/** Quadro completo: colunas + tarefas com bloqueio por dependência (escopadas ao viewer). */
export async function quadroTarefas(viewer: Viewer) {
  const colunas = await prisma.tarefaStatus.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
    include: {
      tarefas: {
        where: { arquivada: false, ...escopoTarefa(viewer) },
        orderBy: { updatedAt: "desc" },
        include: includeTarefaBoard,
      },
    },
  });
  return colunas;
}

/** Tarefas de um projeto vinculadas a uma disciplina, escopadas ao viewer (ficha do projeto). */
export async function tarefasDoProjeto(viewer: Viewer, projetoId: string) {
  return prisma.tarefa.findMany({
    where: { projetoId, disciplinaId: { not: null }, arquivada: false, ...escopoTarefa(viewer) },
    orderBy: { updatedAt: "desc" },
    include: { ...includeTarefaBoard, status: { select: { nome: true, cor: true, concluido: true } } },
  });
}
export type TarefaDoProjeto = Awaited<ReturnType<typeof tarefasDoProjeto>>[number];

/** Colunas ativas (id + nome) — para montar o TarefaDialog fora do board. */
export async function colunasTarefaAtivas() {
  return prisma.tarefaStatus.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true },
  });
}

export async function opcoesTarefa() {
  const [internos, projetos, tarefas, disciplinas] = await Promise.all([
    prisma.user.findMany({
      where: { ativo: true, role: { not: "cliente" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.projeto.findMany({
      where: { situacao: "em_andamento" },
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, codigo: true, nome: true },
    }),
    prisma.tarefa.findMany({
      where: { arquivada: false },
      select: { id: true, titulo: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.disciplina.findMany({
      where: { projeto: { situacao: "em_andamento" } },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true, projetoId: true },
    }),
  ]);
  return { internos, projetos, tarefas, disciplinas };
}

export type ColunaTarefas = Awaited<ReturnType<typeof quadroTarefas>>[number];
export type TarefaItemBoard = ColunaTarefas["tarefas"][number];

/** Tarefa bloqueada = alguma dependência ainda não concluída. */
export function tarefaBloqueada(t: Pick<TarefaItemBoard, "dependeDe">): boolean {
  return t.dependeDe.some((d) => !d.dependeDe.status.concluido);
}
