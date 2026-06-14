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

/** SLA de entregas: prazo cumprido × estourado, por disciplina. */
export async function slaEntregas() {
  const hoje = new Date();
  const discs = await prisma.disciplina.findMany({
    where: { prazo: { not: null }, projeto: { situacao: { in: ["em_andamento", "concluido"] } } },
    select: {
      id: true,
      nome: true,
      status: true,
      prazo: true,
      entregueEm: true,
      projeto: { select: { id: true, codigo: true } },
    },
  });

  let noPrazo = 0;
  let atrasadasEntregues = 0;
  let pendentesVencidas = 0;
  let pendentesEmDia = 0;
  const atrasos: { projeto: string; projetoId: string; nome: string; dias: number; entregue: boolean }[] = [];

  for (const d of discs) {
    const entregue = d.status === "entregue" || d.status === "aprovado";
    if (entregue) {
      if (d.entregueEm) {
        const dias = Math.round((d.entregueEm.getTime() - d.prazo!.getTime()) / 86400000);
        if (dias <= 0) noPrazo++;
        else {
          atrasadasEntregues++;
          atrasos.push({ projeto: d.projeto.codigo, projetoId: d.projeto.id, nome: d.nome, dias, entregue: true });
        }
      } else {
        noPrazo++; // entregue sem data registrada → considera no prazo
      }
    } else if (d.prazo! < hoje) {
      pendentesVencidas++;
      const dias = Math.round((hoje.getTime() - d.prazo!.getTime()) / 86400000);
      atrasos.push({ projeto: d.projeto.codigo, projetoId: d.projeto.id, nome: d.nome, dias, entregue: false });
    } else {
      pendentesEmDia++;
    }
  }

  const baseEntregues = noPrazo + atrasadasEntregues;
  return {
    total: discs.length,
    noPrazo,
    atrasadasEntregues,
    pendentesVencidas,
    pendentesEmDia,
    percentualNoPrazo: baseEntregues > 0 ? Math.round((noPrazo / baseEntregues) * 100) : 100,
    atrasos: atrasos.sort((a, b) => b.dias - a.dias).slice(0, 10),
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
