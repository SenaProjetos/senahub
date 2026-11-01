import "server-only";

import { prisma } from "@/lib/prisma";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { custosDoMes } from "@/modules/rh/rateio/custo-hora/dados";
import { ehItemDeBeneficio } from "@/modules/rh/folha/lancamentos-da-folha";

/** Custo total da folha por pessoa (R4.3): salário + encargos + benefícios, do mesmo cálculo do rateio. */
export type CustoDaFolha = {
  linhas: { userId: string; nome: string; contratacao: string | null; baseCent: number; encargosCent: number; beneficiosCent: number; totalCent: number; semCusto: boolean; semTabela: boolean }[];
  totalCent: number;
};

/**
 * Só a folha mensal tem custo da empresa calculado (a de 13º é salário de outra competência). Pessoa
 * sem custo (PJ, sem salário cadastrado) entra na lista marcada, para ninguém achar que sumiu.
 */
export async function custoDaFolha(folha: { ano: number; mes: number; tipo: string; holerites: { user: { id: string; name: string } }[] }): Promise<CustoDaFolha | null> {
  if (folha.tipo !== "mensal" || folha.holerites.length === 0) return null;
  const custos = await custosDoMes(folha.ano, folha.mes, folha.holerites.map((h) => h.user.id));
  const linhas = folha.holerites.map((h) => {
    const c = custos.get(h.user.id);
    const itens = c?.custo?.itens ?? [];
    const beneficiosCent = itens.filter((i) => ehItemDeBeneficio(i.chave)).reduce((s, i) => s + i.cent, 0);
    const encargosCent = itens.reduce((s, i) => s + i.cent, 0) - beneficiosCent;
    return {
      userId: h.user.id,
      nome: h.user.name,
      contratacao: c?.contratacao ?? null,
      baseCent: c?.custo?.baseCent ?? 0,
      encargosCent,
      beneficiosCent,
      totalCent: c?.custo?.totalCent ?? 0,
      semCusto: !c?.custo,
      semTabela: c?.semTabela ?? false,
    };
  });
  return { linhas, totalCent: linhas.reduce((s, l) => s + l.totalCent, 0) };
}

export type ContaDaFolhaTela = {
  id: string;
  rotulo: string;
  descricao: string;
  categoria: string | null;
  status: "previsto" | "aguardando_aprovacao" | "confirmado" | "cancelado";
  valorCent: number;
  vencimento: string | null;
};

const ROTULO_PARTE: Record<string, string> = {
  bolsa: "Bolsa dos estagiários",
  inss_retido: "INSS descontado",
  irrf_retido: "IRRF descontado",
  fgts: "FGTS",
  beneficio: "Benefício",
  taxa_agente: "Taxa do IEL",
};

/** Contas a pagar que a folha lançou no Financeiro: o líquido CLT e cada parte, com a situação de cada uma. */
export async function contasDaFolha(folhaId: string): Promise<ContaDaFolhaTela[]> {
  const folha = await prisma.folhaPagamento.findUnique({
    where: { id: folhaId },
    select: { lancamentoId: true, partes: { select: { parte: true, rotulo: true, lancamentoId: true } } },
  });
  if (!folha) return [];
  const rotulos = new Map<string, string>();
  if (folha.lancamentoId) rotulos.set(folha.lancamentoId, "Líquido dos CLT");
  for (const p of folha.partes) rotulos.set(p.lancamentoId, p.rotulo ? `${ROTULO_PARTE[p.parte] ?? p.parte} · ${p.rotulo}` : (ROTULO_PARTE[p.parte] ?? p.parte));
  const lancs = await prisma.lancamento.findMany({
    where: { id: { in: [...rotulos.keys()] }, excluidoEm: null },
    select: { id: true, descricao: true, valor: true, valorEfetivo: true, status: true, vencimento: true, categoria: { select: { nome: true } } },
    orderBy: [{ vencimento: "asc" }, { descricao: "asc" }],
  });
  return lancs.map((l) => ({
    id: l.id,
    rotulo: rotulos.get(l.id) ?? l.descricao,
    descricao: l.descricao,
    categoria: l.categoria?.nome ?? null,
    status: l.status as ContaDaFolhaTela["status"],
    valorCent: paraCentavos(l.status === "confirmado" ? (l.valorEfetivo ?? l.valor) : l.valor),
    vencimento: l.vencimento ? l.vencimento.toISOString().slice(0, 10) : null,
  }));
}

export type ReaberturaDaFolha = { motivo: string; autor: string | null; criadoEm: string };
export type VersaoAssinada = { assinadoEm: string; motivo: string; criadoEm: string; itens: { descricao: string; tipo: string; valor: number }[] };

/** Histórico de reaberturas da folha e, por holerite, o que cada pessoa tinha assinado antes de cada reabertura. */
export async function historicoDaFolha(folhaId: string): Promise<{ reaberturas: ReaberturaDaFolha[]; versoesPorHolerite: Record<string, VersaoAssinada[]> }> {
  const [reaberturas, versoes] = await Promise.all([
    prisma.folhaReabertura.findMany({ where: { folhaId }, orderBy: { criadoEm: "desc" }, select: { motivo: true, criadoEm: true, autor: { select: { name: true } } } }),
    prisma.holeriteVersao.findMany({
      where: { holerite: { folhaId } },
      orderBy: { criadoEm: "desc" },
      select: { holeriteId: true, itens: true, assinadoEm: true, motivo: true, criadoEm: true },
    }),
  ]);
  const versoesPorHolerite: Record<string, VersaoAssinada[]> = {};
  for (const v of versoes) {
    const itens = Array.isArray(v.itens) ? (v.itens as { descricao: string; tipo: string; valor: number }[]) : [];
    (versoesPorHolerite[v.holeriteId] ??= []).push({ assinadoEm: v.assinadoEm.toISOString(), motivo: v.motivo, criadoEm: v.criadoEm.toISOString(), itens });
  }
  return {
    reaberturas: reaberturas.map((r) => ({ motivo: r.motivo, autor: r.autor?.name ?? null, criadoEm: r.criadoEm.toISOString() })),
    versoesPorHolerite,
  };
}
