import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma, StatusDisciplina } from "@/generated/prisma/client";
import { GLOBAL_ROLES, type Role } from "@/lib/roles";

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

/** Peso de progresso por status de disciplina (para a barra do projeto). */
const PESO: Record<StatusDisciplina, number> = {
  aguardando: 0,
  em_andamento: 0.4,
  em_revisao: 0.6,
  entregue: 0.85,
  aprovado: 1,
};

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
      ? Math.round((ds.reduce((s, d) => s + PESO[d.status], 0) / ds.length) * 100)
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

/** Série de 6 meses: receita realizada (caixa) vs prevista (a receber). */
export async function serieReceita(meses = 6) {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);

  const [confirmados, previstos] = await Promise.all([
    prisma.lancamento.findMany({
      where: { tipo: "receita", status: "confirmado", dataConfirmacao: { gte: inicio, lte: fim } },
      select: { valor: true, valorEfetivo: true, dataConfirmacao: true },
    }),
    prisma.lancamento.findMany({
      where: { tipo: "receita", status: "previsto", vencimento: { gte: inicio, lte: fim } },
      select: { valor: true, vencimento: true },
    }),
  ]);

  const buckets: { ano: number; mes: number; rotulo: string; realizado: number; previsto: number }[] = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1) + i, 1);
    buckets.push({
      ano: d.getFullYear(),
      mes: d.getMonth(),
      rotulo: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      realizado: 0,
      previsto: 0,
    });
  }
  const idx = (ano: number, mes: number) => buckets.findIndex((b) => b.ano === ano && b.mes === mes);
  for (const l of confirmados) {
    const dt = l.dataConfirmacao!;
    const i = idx(dt.getFullYear(), dt.getMonth());
    if (i >= 0) buckets[i].realizado += Number(l.valorEfetivo ?? l.valor);
  }
  for (const l of previstos) {
    const dt = l.vencimento!;
    const i = idx(dt.getFullYear(), dt.getMonth());
    if (i >= 0) buckets[i].previsto += Number(l.valor);
  }
  return buckets;
}
