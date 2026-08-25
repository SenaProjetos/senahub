import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { GLOBAL_ROLES, type Role } from "@/lib/roles";
import type { SessionUser } from "@/lib/session";
import { escopoProjeto } from "@/modules/projetos/queries";

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
  disciplina: { select: { id: true, disciplinaTextoLegado: true } },
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

export type FiltrosQuadroTarefas = {
  q?: string;
  projetoId?: string;
  disciplinaId?: string;
  responsavelId?: string;
  prioridade?: string;
  periodo?: "atrasadas" | "semana" | "mes";
};

/** Filtros do quadro aplicados no banco, inclusive busca e prazo. */
export function whereQuadroTarefas(
  viewer: Viewer,
  filtros: FiltrosQuadroTarefas,
  referencia = new Date(),
): Prisma.TarefaWhereInput {
  const and: Prisma.TarefaWhereInput[] = [{ arquivada: false, status: { ativo: true } }, escopoTarefa(viewer)];
  if (filtros.q) {
    and.push({
      OR: [
        { titulo: { contains: filtros.q, mode: "insensitive" } },
        { descricao: { contains: filtros.q, mode: "insensitive" } },
      ],
    });
  }
  if (filtros.projetoId) and.push({ projetoId: filtros.projetoId });
  if (filtros.disciplinaId) and.push({ disciplinaId: filtros.disciplinaId });
  if (filtros.responsavelId) and.push({ responsaveis: { some: { userId: filtros.responsavelId } } });
  if (filtros.prioridade) and.push({ prioridade: filtros.prioridade });

  const inicioHoje = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  if (filtros.periodo === "atrasadas") {
    and.push({ prazo: { lt: inicioHoje }, status: { concluido: false } });
  } else if (filtros.periodo === "semana") {
    const fimSemana = new Date(inicioHoje);
    fimSemana.setDate(fimSemana.getDate() + 7);
    and.push({ prazo: { gte: inicioHoje, lte: fimSemana } });
  } else if (filtros.periodo === "mes") {
    const inicioMes = new Date(inicioHoje.getFullYear(), inicioHoje.getMonth(), 1);
    const proximoMes = new Date(inicioHoje.getFullYear(), inicioHoje.getMonth() + 1, 1);
    and.push({ prazo: { gte: inicioMes, lt: proximoMes } });
  }
  return { AND: and };
}

/** Quadro paginado: colunas ativas + tarefas filtradas e escopadas ao viewer. */
export async function quadroTarefas(
  viewer: Viewer,
  filtros: FiltrosQuadroTarefas = {},
  paginacao = { skip: 0, take: 24 },
) {
  const where = whereQuadroTarefas(viewer, filtros);
  const [status, tarefas, total] = await Promise.all([
    prisma.tarefaStatus.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" } }),
    prisma.tarefa.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: paginacao.skip,
      take: paginacao.take,
      include: includeTarefaBoard,
    }),
    prisma.tarefa.count({ where }),
  ]);
  return {
    colunas: status.map((coluna) => ({
      ...coluna,
      tarefas: tarefas.filter((tarefa) => tarefa.statusId === coluna.id),
    })),
    total,
  };
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

/** Resumo mínimo para o contexto de uma pendência, sempre filtrado por `escopoTarefa`. */
export type TarefaContextual = {
  id: string;
  titulo: string;
  status: { nome: string; concluido: boolean };
  responsaveis: { id: string; nome: string }[];
  itens: { id: string; descricao: string; concluido: boolean }[];
};

export async function contextoTarefasDasPendencias(viewer: Viewer, tarefaIds: readonly string[]): Promise<TarefaContextual[]> {
  const ids = [...new Set(tarefaIds)];
  if (ids.length === 0) return [];

  const tarefas = await prisma.tarefa.findMany({
    where: { id: { in: ids }, arquivada: false, ...escopoTarefa(viewer) },
    select: {
      id: true,
      titulo: true,
      status: { select: { nome: true, concluido: true } },
      responsaveis: { select: { user: { select: { id: true, name: true } } } },
      itens: { orderBy: { ordem: "asc" }, select: { id: true, descricao: true, concluido: true } },
    },
  });

  return tarefas.map((tarefa) => ({
    id: tarefa.id,
    titulo: tarefa.titulo,
    status: tarefa.status,
    responsaveis: tarefa.responsaveis.map((responsavel) => ({ id: responsavel.user.id, nome: responsavel.user.name })),
    itens: tarefa.itens,
  }));
}

/** Colunas ativas (id + nome) — para montar o TarefaDialog fora do board. */
export async function colunasTarefaAtivas() {
  return prisma.tarefaStatus.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true },
  });
}

export async function opcoesTarefa(viewer: SessionUser) {
  const [internos, projetos, tarefas, disciplinas] = await Promise.all([
    prisma.user.findMany({
      where: { ativo: true, role: { not: "cliente" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.projeto.findMany({
      where: { situacao: "em_andamento", AND: [escopoProjeto(viewer)] },
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, codigo: true, nome: true },
    }),
    prisma.tarefa.findMany({
      where: { arquivada: false, ...escopoTarefa(viewer) },
      select: {
        id: true,
        titulo: true,
        projeto: { select: { codigo: true } },
        status: { select: { nome: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.disciplina.findMany({
      where: { projeto: { situacao: "em_andamento", AND: [escopoProjeto(viewer)] } },
      orderBy: [{ ordem: "asc" }, { disciplinaTextoLegado: "asc" }],
      select: { id: true, disciplinaTextoLegado: true, projetoId: true },
    }),
  ]);
  // `disciplinaTextoLegado` volta a se chamar `nome` na fronteira da UI: `OpcoesUI`
  // (`components/tarefas/tarefa-dialog.tsx`) é tipo de tela e fala "nome", não o nome do campo
  // do banco. A F1.19c renomeou só a coluna no schema — o rótulo exibido não mudou.
  return {
    internos,
    projetos,
    tarefas: tarefas.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      projetoCodigo: t.projeto?.codigo ?? null,
      statusNome: t.status.nome,
    })),
    disciplinas: disciplinas.map((d) => ({ id: d.id, nome: d.disciplinaTextoLegado, projetoId: d.projetoId })),
  };
}

export type ColunaTarefas = Awaited<ReturnType<typeof quadroTarefas>>["colunas"][number];
export type TarefaItemBoard = ColunaTarefas["tarefas"][number];

/** Tarefa bloqueada = alguma dependência ainda não concluída. */
export function tarefaBloqueada(t: Pick<TarefaItemBoard, "dependeDe">): boolean {
  return t.dependeDe.some((d) => !d.dependeDe.status.concluido);
}
