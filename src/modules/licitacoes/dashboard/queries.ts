import "server-only";
import { prisma } from "@/lib/prisma";
import { STATUS_LICITACAO } from "@/modules/licitacoes/status";
import { taxaVitoria } from "./kpis";

export type DashboardLicitacoes = {
  total: number;
  porStatus: { status: string; count: number; valor: number }[]; // os 5 status, com 0 default
  taxaVitoria: number;
  valorEmDisputa: number; // soma valorEstimado em_andamento
  valorEmExecucao: number; // soma valorEstimado em_execucao
  proximosPrazos: { id: string; titulo: string; prazoProposta: string }[];
};

export async function obterDashboardLicitacoes(): Promise<DashboardLicitacoes> {
  const grupos = await prisma.licitacao.groupBy({
    by: ["status"],
    _count: { _all: true },
    _sum: { valorEstimado: true },
  });
  const mapa = new Map(
    grupos.map((g) => [
      g.status as string,
      {
        count: g._count._all,
        valor: g._sum.valorEstimado != null ? Number(g._sum.valorEstimado) : 0,
      },
    ])
  );
  const porStatus = STATUS_LICITACAO.map((s) => ({
    status: s,
    count: mapa.get(s)?.count ?? 0,
    valor: mapa.get(s)?.valor ?? 0,
  }));
  const get = (s: string) => mapa.get(s) ?? { count: 0, valor: 0 };
  const total = porStatus.reduce((a, b) => a + b.count, 0);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const proximos = await prisma.licitacao.findMany({
    where: { status: "em_andamento", prazoProposta: { gte: hoje } },
    orderBy: { prazoProposta: "asc" },
    take: 5,
    select: { id: true, titulo: true, prazoProposta: true },
  });

  return {
    total,
    porStatus,
    taxaVitoria: taxaVitoria(
      get("ganha").count + get("em_execucao").count + get("concluida").count,
      get("perdida").count
    ),
    valorEmDisputa: get("em_andamento").valor,
    valorEmExecucao: get("em_execucao").valor,
    proximosPrazos: proximos.map((p) => ({
      id: p.id,
      titulo: p.titulo,
      prazoProposta: p.prazoProposta ? p.prazoProposta.toISOString().slice(0, 10) : "",
    })),
  };
}

/** Snapshot do funil para um mês (ponto no tempo). Upsert por (ano, mes). */
export async function gravarSnapshotLicitacaoMensal(ano: number, mes: number): Promise<void> {
  const grupos = await prisma.licitacao.groupBy({
    by: ["status"],
    _count: { _all: true },
    _sum: { valorEstimado: true },
  });
  const mapa = new Map(
    grupos.map((g) => [
      g.status as string,
      {
        count: g._count._all,
        valor: g._sum.valorEstimado != null ? Number(g._sum.valorEstimado) : 0,
      },
    ])
  );
  const get = (s: string) => mapa.get(s) ?? { count: 0, valor: 0 };
  const ganhas = get("ganha").count + get("em_execucao").count + get("concluida").count;
  const valorGanho = get("ganha").valor + get("em_execucao").valor + get("concluida").valor;
  const data = {
    totalAbertas: get("em_andamento").count,
    totalGanhas: ganhas,
    totalPerdidas: get("perdida").count,
    valorGanho,
    valorPerdido: get("perdida").valor,
    valorEmDisputa: get("em_andamento").valor,
  };
  await prisma.licitacaoMetricaMensal.upsert({
    where: { ano_mes: { ano, mes } },
    create: { ano, mes, ...data },
    update: data,
  });
}
