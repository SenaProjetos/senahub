import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const LINHA_LANC_SELECT = {
  id: true,
  descricao: true,
  valor: true,
  vencimento: true,
  tipo: true,
  status: true,
  fornecedor: { select: { nome: true } },
  cliente: { select: { nome: true } },
  projeto: { select: { codigo: true, nome: true } },
  categoria: { select: { nome: true } },
  centro: { select: { nome: true } },
} satisfies Prisma.LancamentoSelect;

type LancRaw = Prisma.LancamentoGetPayload<{ select: typeof LINHA_LANC_SELECT }>;
function serialLanc(l: LancRaw) {
  return {
    id: l.id,
    descricao: l.descricao,
    valor: Number(l.valor),
    vencimento: l.vencimento ? l.vencimento.toISOString().slice(0, 10) : null,
    tipo: l.tipo,
    status: l.status,
    favorecido: l.fornecedor?.nome ?? l.cliente?.nome ?? null,
    projeto: l.projeto ? { codigo: l.projeto.codigo, nome: l.projeto.nome } : null,
    categoria: l.categoria?.nome ?? null,
    centro: l.centro?.nome ?? null,
  };
}
export type LancamentoPlano = ReturnType<typeof serialLanc>;

export async function opcoesPlanejamento() {
  const [contas, centros, projetos] = await Promise.all([
    prisma.contaBancaria.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
    prisma.centroCusto.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
    prisma.projeto.findMany({ orderBy: [{ ano: "desc" }, { sequencial: "desc" }], select: { id: true, codigo: true, nome: true } }),
  ]);
  return { contas, centros, projetos };
}
export type OpcoesPlanejamento = Awaited<ReturnType<typeof opcoesPlanejamento>>;

/** Despesas previstas (a pagar) candidatas a entrar num plano, conforme filtros. */
export async function contasEmAberto(filtros: {
  periodoIni?: Date | null;
  periodoFim?: Date | null;
  centroId?: string | null;
  projetoId?: string | null;
  excluirIds?: string[];
}): Promise<LancamentoPlano[]> {
  const where: Prisma.LancamentoWhereInput = { status: "previsto", tipo: "despesa" };
  if (filtros.centroId) where.centroId = filtros.centroId;
  if (filtros.projetoId) where.projetoId = filtros.projetoId;
  if (filtros.excluirIds?.length) where.id = { notIn: filtros.excluirIds };
  if (filtros.periodoIni || filtros.periodoFim) {
    const venc: Prisma.DateTimeNullableFilter = {};
    if (filtros.periodoIni) venc.gte = filtros.periodoIni;
    if (filtros.periodoFim) venc.lte = filtros.periodoFim;
    where.vencimento = venc;
  }
  const rows = await prisma.lancamento.findMany({ where, orderBy: [{ vencimento: "asc" }], select: LINHA_LANC_SELECT });
  return rows.map(serialLanc);
}

export async function listarPlanos() {
  const planos = await prisma.planejamentoPagamento.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      responsavel: { select: { name: true } },
      linhas: { select: { valorPlanejado: true, selecionada: true } },
    },
  });
  return planos.map((p) => ({
    id: p.id,
    nome: p.nome,
    status: p.status,
    saldoDisponivel: Number(p.saldoDisponivel),
    totalPlanejado: p.linhas
      .filter((l) => l.selecionada)
      .reduce((s, l) => s + Number(l.valorPlanejado), 0),
    qtdLinhas: p.linhas.length,
    responsavel: p.responsavel.name,
    criadoEm: p.createdAt.toISOString(),
  }));
}
export type PlanoResumo = Awaited<ReturnType<typeof listarPlanos>>[number];

export async function obterPlano(id: string) {
  const p = await prisma.planejamentoPagamento.findUnique({
    where: { id },
    include: {
      responsavel: { select: { name: true } },
      conta: { select: { nome: true } },
      centro: { select: { nome: true } },
      projeto: { select: { codigo: true, nome: true } },
      linhas: { orderBy: { ordem: "asc" }, include: { lancamento: { select: LINHA_LANC_SELECT } } },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    nome: p.nome,
    status: p.status,
    saldoDisponivel: Number(p.saldoDisponivel),
    periodoIni: p.periodoIni ? p.periodoIni.toISOString().slice(0, 10) : null,
    periodoFim: p.periodoFim ? p.periodoFim.toISOString().slice(0, 10) : null,
    conta: p.conta?.nome ?? null,
    centro: p.centro?.nome ?? null,
    projeto: p.projeto ? `${p.projeto.codigo} ${p.projeto.nome}` : null,
    observacoes: p.observacoes,
    responsavel: p.responsavel.name,
    aprovadoEm: p.aprovadoEm ? p.aprovadoEm.toISOString() : null,
    executadoEm: p.executadoEm ? p.executadoEm.toISOString() : null,
    linhas: p.linhas.map((ln) => ({
      id: ln.id,
      lancamentoId: ln.lancamentoId,
      ordem: ln.ordem,
      valorPlanejado: Number(ln.valorPlanejado),
      selecionada: ln.selecionada,
      lancamento: serialLanc(ln.lancamento),
    })),
  };
}
export type PlanoDetalhe = NonNullable<Awaited<ReturnType<typeof obterPlano>>>;
export type PlanoLinhaDetalhe = PlanoDetalhe["linhas"][number];
