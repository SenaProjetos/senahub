import "server-only";
import { prisma } from "@/lib/prisma";

// ── Funil ─────────────────────────────────────────────────────
export async function funilCompleto() {
  const etapas = await prisma.funilEtapa.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
    include: {
      leads: {
        where: { arquivado: false },
        orderBy: { updatedAt: "desc" },
        include: { cliente: { select: { id: true, nome: true } }, _count: { select: { propostas: true } } },
      },
    },
  });
  return etapas;
}

export async function obterLead(id: string) {
  return prisma.lead.findUnique({
    where: { id },
    include: {
      etapa: true,
      cliente: { select: { id: true, nome: true } },
      atividades: { orderBy: { createdAt: "desc" }, include: { autor: { select: { name: true } } } },
      propostas: { select: { id: true, numero: true, titulo: true, status: true } },
    },
  });
}

// ── Dashboard / metas ─────────────────────────────────────────
export async function resumoComercial() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = agora.getMonth() + 1;
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 0, 23, 59, 59);

  const [meta, aceitas, enviadas, leadsAtivos] = await Promise.all([
    prisma.metaComercial.findUnique({ where: { ano_mes: { ano, mes } } }),
    prisma.proposta.findMany({
      where: { status: "aceita", aceitaEm: { gte: ini, lte: fim } },
      include: { itens: { select: { valor: true } } },
    }),
    prisma.proposta.count({ where: { status: "enviada" } }),
    prisma.lead.count({ where: { arquivado: false } }),
  ]);

  const realizado = aceitas.reduce(
    (s, p) => s + p.itens.reduce((x, i) => x + Number(i.valor), 0),
    0,
  );
  return {
    ano,
    mes,
    meta: meta ? Number(meta.valor) : 0,
    realizado,
    aceitasNoMes: aceitas.length,
    enviadas,
    leadsAtivos,
  };
}

// ── Propostas ─────────────────────────────────────────────────
const INCLUDE_PROPOSTA = {
  cliente: { select: { id: true, nome: true } },
  itens: { orderBy: { ordem: "asc" as const } },
  condicoes: { orderBy: { ordem: "asc" as const } },
  _count: { select: { visualizacoes: true, versoes: true } },
};

export async function listarPropostas(status?: string) {
  return prisma.proposta.findMany({
    where: status ? { status: status as never } : {},
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    include: INCLUDE_PROPOSTA,
  });
}

export async function obterProposta(id: string) {
  return prisma.proposta.findUnique({
    where: { id },
    include: {
      ...INCLUDE_PROPOSTA,
      lead: { select: { id: true, nome: true } },
      visualizacoes: { orderBy: { createdAt: "desc" }, take: 10 },
      versoes: { orderBy: { numero: "desc" }, take: 10, include: { autor: { select: { name: true } } } },
    },
  });
}

export async function listarTabelasPreco() {
  return prisma.tabelaPreco.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    include: { itens: { orderBy: { disciplina: "asc" } } },
  });
}

export function totalProposta(itens: { valor: unknown }[]): number {
  return itens.reduce((s, i) => s + Number(i.valor), 0);
}

export type EtapaFunil = Awaited<ReturnType<typeof funilCompleto>>[number];
export type LeadItem = EtapaFunil["leads"][number];
export type PropostaListItem = Awaited<ReturnType<typeof listarPropostas>>[number];
export type PropostaDetalhe = NonNullable<Awaited<ReturnType<typeof obterProposta>>>;
export type TabelaPrecoItem = Awaited<ReturnType<typeof listarTabelasPreco>>[number];
