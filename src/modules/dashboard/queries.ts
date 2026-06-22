import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma, StatusDisciplina } from "@/generated/prisma/client";
import { GLOBAL_ROLES, type Role } from "@/lib/roles";
import { kpisHome } from "@/modules/qualidade/queries";
import { montarSerieReceita } from "@/modules/dashboard/serie-receita";
import { PESO_STATUS } from "@/modules/projetos/status";

type Viewer = { id: string; role: Role };

function escopo(viewer: Viewer): Prisma.ProjetoWhereInput {
  if (viewer.role === "admin" || GLOBAL_ROLES.includes(viewer.role)) return {};
  return {
    OR: [
      { membros: { some: { userId: viewer.id } } },
      { disciplinas: { some: { responsaveis: { some: { userId: viewer.id } } } } },
    ],
  };
}

/** Status "predominante" do projeto: o de menor progresso entre as não concluídas (gargalo). */
const ORDEM_STATUS: StatusDisciplina[] = ["aguardando", "em_andamento", "em_revisao", "entregue", "aprovado"];

/** Projetos ativos recentes do viewer, com progresso e status do gargalo. */
export async function projetosRecentes(viewer: Viewer, limite = 6) {
  const projetos = await prisma.projeto.findMany({
    where: { AND: [escopo(viewer), { situacao: "em_andamento" }] },
    orderBy: { updatedAt: "desc" },
    take: limite,
    select: {
      id: true,
      codigo: true,
      nome: true,
      cliente: { select: { nome: true } },
      disciplinas: { select: { status: true } },
    },
  });
  return projetos.map((p) => {
    const ds = p.disciplinas;
    const progresso = ds.length
      ? Math.round((ds.reduce((s, d) => s + PESO_STATUS[d.status], 0) / ds.length) * 100)
      : 0;
    // status do gargalo = o de menor ordem presente entre as não aprovadas
    const pendentes = ds.filter((d) => d.status !== "aprovado");
    const gargalo =
      (pendentes.length ? pendentes : ds)
        .map((d) => d.status)
        .sort((a, b) => ORDEM_STATUS.indexOf(a) - ORDEM_STATUS.indexOf(b))[0] ?? "aguardando";
    return {
      id: p.id,
      codigo: p.codigo,
      nome: p.nome,
      cliente: p.cliente.nome,
      progresso,
      status: gargalo as StatusDisciplina,
    };
  });
}

/** N-09: Carteira de projetos em andamento para o dashboard do admin (todos — sem escopo). */
export async function carteiraProjetosDashboard() {
  const projetos = await prisma.projeto.findMany({
    where: { situacao: "em_andamento" },
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: {
      id: true,
      codigo: true,
      nome: true,
      prazoFinal: true,
      situacao: true,
      cliente: { select: { nome: true } },
      disciplinas: {
        select: {
          status: true,
          prazo: true,
        },
      },
    },
  });
  return projetos.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    cliente: p.cliente.nome,
    prazoFinal: p.prazoFinal?.toISOString().slice(0, 10) ?? null,
    progresso: p.disciplinas.length
      ? Math.round(
          (p.disciplinas.reduce((s, d) => s + PESO_STATUS[d.status], 0) / p.disciplinas.length) * 100,
        )
      : 0,
    disciplinas: p.disciplinas.map((d) => ({
      status: d.status,
      prazo: d.prazo?.toISOString().slice(0, 10) ?? null,
    })),
  }));
}

/** Grava a foto diária dos KPIs (idempotente por dia; chamado pelo job). */
export async function gravarSnapshotDashboard() {
  const hoje = new Date();
  const dia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const k = await kpisHome();
  const recebido = await prisma.lancamento.aggregate({
    where: {
      tipo: "receita",
      status: "confirmado",
      dataConfirmacao: {
        gte: new Date(hoje.getFullYear(), hoje.getMonth(), 1),
        lte: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59),
      },
    },
    _sum: { valor: true },
  });
  const dados = {
    projetosAtivos: k.projetosAtivos,
    receitaPrevista: k.receitaPrevista,
    entregasPendentes: k.entregasPendentes,
    recebidoNoMes: Number(recebido._sum.valor ?? 0),
  };
  return prisma.dashboardSnapshot.upsert({
    where: { dia },
    create: { dia, ...dados },
    update: dados,
  });
}

/** Série histórica de KPIs (mais antigos→recentes para gráfico). */
export async function snapshotsDashboard(n = 30) {
  const snaps = await prisma.dashboardSnapshot.findMany({ orderBy: { dia: "desc" }, take: n });
  return snaps.reverse().map((s) => ({
    dia: s.dia.toISOString().slice(0, 10),
    projetosAtivos: s.projetosAtivos,
    receitaPrevista: Number(s.receitaPrevista),
    entregasPendentes: s.entregasPendentes,
    recebidoNoMes: Number(s.recebidoNoMes),
  }));
}

/** Série de 6 meses: receita realizada (caixa) vs prevista original (por vencimento). */
export async function serieReceita(meses = 6) {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);

  const [confirmados, previstos] = await Promise.all([
    prisma.lancamento.findMany({
      where: { tipo: "receita", status: "confirmado", dataConfirmacao: { gte: inicio, lte: fim } },
      select: { valor: true, valorEfetivo: true, dataConfirmacao: true },
    }),
    // Previsto ORIGINAL: toda receita com vencimento no período, independente do status.
    prisma.lancamento.findMany({
      where: { tipo: "receita", vencimento: { gte: inicio, lte: fim } },
      select: { valor: true, vencimento: true },
    }),
  ]);

  return montarSerieReceita(
    confirmados.map((l) => ({ valor: Number(l.valorEfetivo ?? l.valor), data: l.dataConfirmacao! })),
    previstos.map((l) => ({ valor: Number(l.valor), data: l.vencimento! })),
    hoje,
    meses,
  );
}
