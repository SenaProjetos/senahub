import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { GLOBAL_ROLES, type Role } from "@/lib/roles";

type Viewer = { id: string; role: Role };

function isGlobal(role: Role) {
  return role === "admin" || GLOBAL_ROLES.includes(role);
}

/** Escopo: global vê todos os projetos; demais só onde participam (membro ou responsável). */
function escopo(viewer: Viewer): Prisma.ProjetoWhereInput {
  if (isGlobal(viewer.role)) return {};
  return {
    OR: [
      { membros: { some: { userId: viewer.id } } },
      { disciplinas: { some: { responsaveis: { some: { userId: viewer.id } } } } },
    ],
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Projetos visíveis ao viewer + resumo do plano (página índice de Planejamento). */
export async function projetosComPlano(viewer: Viewer) {
  const projetos = await prisma.projeto.findMany({
    where: { AND: [escopo(viewer), { situacao: { in: ["em_andamento", "concluido"] } }] },
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: {
      id: true,
      codigo: true,
      nome: true,
      situacao: true,
      eapTarefas: { select: { inicioPrevisto: true, fimPrevisto: true, progresso: true } },
    },
  });
  return projetos.map((p) => {
    const t = p.eapTarefas;
    const inicio = t.length ? new Date(Math.min(...t.map((x) => x.inicioPrevisto.getTime()))) : null;
    const fim = t.length ? new Date(Math.max(...t.map((x) => x.fimPrevisto.getTime()))) : null;
    const progresso = t.length
      ? Math.round(t.reduce((s, x) => s + x.progresso, 0) / t.length)
      : 0;
    return {
      id: p.id,
      codigo: p.codigo,
      nome: p.nome,
      situacao: p.situacao,
      totalTarefas: t.length,
      inicio: inicio ? iso(inicio) : null,
      fim: fim ? iso(fim) : null,
      progresso,
    };
  });
}

/** Um projeto pode ser visto pelo viewer? (escopo). */
export async function projetoVisivel(viewer: Viewer, projetoId: string) {
  if (isGlobal(viewer.role)) {
    return prisma.projeto.findUnique({ where: { id: projetoId }, select: { id: true, codigo: true, nome: true } });
  }
  return prisma.projeto.findFirst({
    where: { AND: [{ id: projetoId }, escopo(viewer)] },
    select: { id: true, codigo: true, nome: true },
  });
}

/** EAP completa de um projeto (lista plana ordenada por hierarquia; árvore montada no client). */
export async function eapDoProjeto(projetoId: string) {
  const tarefas = await prisma.eapTarefa.findMany({
    where: { projetoId },
    orderBy: { ordem: "asc" },
    include: {
      disciplina: { select: { id: true, nome: true } },
      predecessoras: { select: { predecessoraId: true } },
    },
  });
  const disciplinas = await prisma.disciplina.findMany({
    where: { projetoId },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true },
  });
  return {
    tarefas: tarefas.map((t) => ({
      id: t.id,
      parentId: t.parentId,
      nome: t.nome,
      ordem: t.ordem,
      progresso: t.progresso,
      inicioPrevisto: iso(t.inicioPrevisto),
      fimPrevisto: iso(t.fimPrevisto),
      inicioBaseline: t.inicioBaseline ? iso(t.inicioBaseline) : null,
      fimBaseline: t.fimBaseline ? iso(t.fimBaseline) : null,
      disciplinaId: t.disciplinaId,
      disciplinaNome: t.disciplina?.nome ?? null,
      predecessoraIds: t.predecessoras.map((p) => p.predecessoraId),
    })),
    disciplinas,
    temLinhaBase: tarefas.some((t) => t.inicioBaseline != null),
  };
}

export type EapTarefaDTO = Awaited<ReturnType<typeof eapDoProjeto>>["tarefas"][number];

/** Cronograma consolidado: projetos ativos (com EAP) + suas tarefas/linha de base (#7). */
export async function cronogramaProjetosAtivos() {
  const projetos = await prisma.projeto.findMany({
    where: { situacao: "em_andamento", eapTarefas: { some: {} } },
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: {
      id: true,
      codigo: true,
      nome: true,
      eapTarefas: {
        orderBy: { ordem: "asc" },
        include: {
          disciplina: { select: { id: true, nome: true } },
          predecessoras: { select: { predecessoraId: true } },
        },
      },
    },
  });
  return projetos.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    temLinhaBase: p.eapTarefas.some((t) => t.inicioBaseline != null),
    tarefas: p.eapTarefas.map((t) => ({
      id: t.id,
      parentId: t.parentId,
      nome: t.nome,
      ordem: t.ordem,
      progresso: t.progresso,
      inicioPrevisto: iso(t.inicioPrevisto),
      fimPrevisto: iso(t.fimPrevisto),
      inicioBaseline: t.inicioBaseline ? iso(t.inicioBaseline) : null,
      fimBaseline: t.fimBaseline ? iso(t.fimBaseline) : null,
      disciplinaId: t.disciplinaId,
      disciplinaNome: t.disciplina?.nome ?? null,
      predecessoraIds: t.predecessoras.map((pp) => pp.predecessoraId),
    })),
  }));
}

/**
 * Matriz de recursos: pessoas (recursos) × projetos, com total de alocação vs capacidade.
 * Superalocado = soma dos percentuais > capacidade × 100.
 */
export async function matrizRecursos() {
  const [recursos, projetos, usuariosSemRecurso] = await Promise.all([
    prisma.recurso.findMany({
      where: { ativo: true },
      include: {
        user: { select: { id: true, name: true, role: true } },
        alocacoes: {
          include: { projeto: { select: { id: true, codigo: true, nome: true } } },
        },
      },
    }),
    prisma.projeto.findMany({
      where: { situacao: "em_andamento" },
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, codigo: true, nome: true },
    }),
    prisma.user.findMany({
      where: { ativo: true, role: { notIn: ["cliente", "freelancer"] }, recurso: null },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const linhas = recursos
    .map((r) => {
      const capacidadePct = Math.round(Number(r.capacidade) * 100);
      const total = r.alocacoes.reduce((s, a) => s + a.percentual, 0);
      return {
        recursoId: r.id,
        userId: r.user.id,
        nome: r.user.name,
        role: r.user.role,
        capacidade: Number(r.capacidade),
        capacidadePct,
        cor: r.cor,
        custoHora: r.custoHora != null ? Number(r.custoHora) : null,
        totalAlocado: total,
        superalocado: total > capacidadePct,
        alocacoes: r.alocacoes.map((a) => ({
          id: a.id,
          projetoId: a.projetoId,
          projetoCodigo: a.projeto.codigo,
          projetoNome: a.projeto.nome,
          percentual: a.percentual,
          inicio: a.inicio ? iso(a.inicio) : null,
          fim: a.fim ? iso(a.fim) : null,
          observacao: a.observacao,
        })),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return { linhas, projetos, usuariosSemRecurso };
}
