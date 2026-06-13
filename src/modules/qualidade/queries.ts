import "server-only";
import { prisma } from "@/lib/prisma";

/** Índice de retrabalho atual: % de disciplinas (não arquivadas) com ≥1 revisão. */
export async function indiceQualidadeAtual() {
  const [total, comRevisao, porDisciplina] = await Promise.all([
    prisma.disciplina.count({ where: { projeto: { situacao: "em_andamento" } } }),
    prisma.disciplina.count({
      where: { projeto: { situacao: "em_andamento" }, revisoes: { some: {} } },
    }),
    prisma.disciplina.groupBy({
      by: ["nome"],
      where: { projeto: { situacao: "em_andamento" } },
      _count: { _all: true },
    }),
  ]);

  // revisões por nome de disciplina
  const revisoes = await prisma.revisaoDisciplina.groupBy({
    by: ["disciplinaId"],
    _count: { _all: true },
  });
  const discs = await prisma.disciplina.findMany({
    where: { id: { in: revisoes.map((r) => r.disciplinaId) } },
    select: { id: true, nome: true },
  });
  const nomePorId = new Map(discs.map((d) => [d.id, d.nome]));
  const revPorNome = new Map<string, number>();
  for (const r of revisoes) {
    const nome = nomePorId.get(r.disciplinaId);
    if (nome) revPorNome.set(nome, (revPorNome.get(nome) ?? 0) + r._count._all);
  }

  return {
    total,
    comRevisao,
    indice: total > 0 ? Math.round((comRevisao / total) * 10000) / 100 : 0,
    porDisciplina: porDisciplina.map((d) => ({
      nome: d.nome,
      total: d._count._all,
      revisoes: revPorNome.get(d.nome) ?? 0,
    })),
  };
}

export async function snapshotsQualidade() {
  return prisma.qualidadeSnapshot.findMany({
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    take: 12,
  });
}

/** Grava a foto mensal (chamado pelo job dia 1º; idempotente por mês). */
export async function gravarSnapshotQualidade(ano: number, mes: number) {
  const { total, comRevisao, indice } = await indiceQualidadeAtual();
  return prisma.qualidadeSnapshot.upsert({
    where: { ano_mes: { ano, mes } },
    create: { ano, mes, indice, totalDisciplinas: total, comRevisao },
    update: { indice, totalDisciplinas: total, comRevisao },
  });
}

/** KPIs reais da home. */
export async function kpisHome() {
  const seteDias = new Date();
  seteDias.setDate(seteDias.getDate() + 7);
  const [projetosAtivos, receitaPrevista, entregasPendentes] = await Promise.all([
    prisma.projeto.count({ where: { situacao: "em_andamento" } }),
    prisma.lancamento.aggregate({
      where: { tipo: "receita", status: "previsto" },
      _sum: { valor: true },
    }),
    prisma.disciplina.count({
      where: {
        status: { notIn: ["aprovado", "entregue"] },
        prazo: { lte: seteDias },
        projeto: { situacao: "em_andamento" },
      },
    }),
  ]);
  return {
    projetosAtivos,
    receitaPrevista: Number(receitaPrevista._sum.valor ?? 0),
    entregasPendentes,
  };
}
