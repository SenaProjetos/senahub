import "server-only";
import { prisma } from "@/lib/prisma";

export type LinhaDRE = { codigo: string; nome: string; tipo: string; valor: number };
export type DRE = {
  de: string;
  ate: string;
  receitas: LinhaDRE[];
  despesas: LinhaDRE[];
  totalReceitas: number;
  totalDespesas: number;
  resultado: number;
};

/** DRE por competência: confirmados no período, agrupados por categoria. */
export async function relatorioDRE(de: Date, ate: Date): Promise<DRE> {
  const lancamentos = await prisma.lancamento.findMany({
    where: { status: "confirmado", dataConfirmacao: { gte: de, lte: ate } },
    include: { categoria: { select: { codigo: true, nome: true, tipo: true } } },
  });

  const mapa = new Map<string, LinhaDRE>();
  for (const l of lancamentos) {
    const k = l.categoria.codigo;
    const cur = mapa.get(k) ?? {
      codigo: l.categoria.codigo,
      nome: l.categoria.nome,
      tipo: l.categoria.tipo,
      valor: 0,
    };
    cur.valor += Number(l.valorEfetivo ?? l.valor);
    mapa.set(k, cur);
  }

  const linhas = [...mapa.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const receitas = linhas.filter((l) => l.tipo === "receita");
  const despesas = linhas.filter((l) => l.tipo === "despesa");
  const totalReceitas = receitas.reduce((s, l) => s + l.valor, 0);
  const totalDespesas = despesas.reduce((s, l) => s + l.valor, 0);

  return {
    de: de.toISOString().slice(0, 10),
    ate: ate.toISOString().slice(0, 10),
    receitas,
    despesas,
    totalReceitas,
    totalDespesas,
    resultado: totalReceitas - totalDespesas,
  };
}

export type LinhaOrcamento = {
  codigo: string;
  nome: string;
  tipo: string;
  previsto: number;
  realizado: number;
};
export type Orcamento = {
  de: string;
  ate: string;
  receitas: LinhaOrcamento[];
  despesas: LinhaOrcamento[];
  totais: {
    receitaPrevista: number;
    receitaRealizada: number;
    despesaPrevista: number;
    despesaRealizada: number;
  };
};

/**
 * Orçamento por categoria no período (por competência `data`):
 * previsto = lançamentos ainda previstos; realizado = confirmados (valorEfetivo).
 */
export async function orcamentoPorCategoria(de: Date, ate: Date): Promise<Orcamento> {
  const lancamentos = await prisma.lancamento.findMany({
    where: { data: { gte: de, lte: ate } },
    include: { categoria: { select: { codigo: true, nome: true, tipo: true } } },
  });

  const mapa = new Map<string, LinhaOrcamento>();
  for (const l of lancamentos) {
    const k = l.categoria.codigo;
    const cur =
      mapa.get(k) ??
      { codigo: l.categoria.codigo, nome: l.categoria.nome, tipo: l.categoria.tipo, previsto: 0, realizado: 0 };
    if (l.status === "confirmado") cur.realizado += Number(l.valorEfetivo ?? l.valor);
    else cur.previsto += Number(l.valor);
    mapa.set(k, cur);
  }

  const linhas = [...mapa.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const receitas = linhas.filter((l) => l.tipo === "receita");
  const despesas = linhas.filter((l) => l.tipo === "despesa");
  const soma = (arr: LinhaOrcamento[], campo: "previsto" | "realizado") =>
    arr.reduce((s, l) => s + l[campo], 0);

  return {
    de: de.toISOString().slice(0, 10),
    ate: ate.toISOString().slice(0, 10),
    receitas,
    despesas,
    totais: {
      receitaPrevista: soma(receitas, "previsto"),
      receitaRealizada: soma(receitas, "realizado"),
      despesaPrevista: soma(despesas, "previsto"),
      despesaRealizada: soma(despesas, "realizado"),
    },
  };
}

export type MesResultado = { mes: number; rotulo: string; receita: number; despesa: number; resultado: number };

/** Série mensal (12 meses do ano) de receita/despesa realizadas e resultado — para gráfico. */
export async function serieMensalResultado(ano: number): Promise<MesResultado[]> {
  const lancs = await prisma.lancamento.findMany({
    where: {
      status: "confirmado",
      dataConfirmacao: { gte: new Date(ano, 0, 1), lte: new Date(ano, 11, 31, 23, 59, 59) },
    },
    select: { tipo: true, valor: true, valorEfetivo: true, dataConfirmacao: true },
  });
  const meses: MesResultado[] = Array.from({ length: 12 }, (_, i) => ({
    mes: i,
    rotulo: new Date(ano, i, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    receita: 0,
    despesa: 0,
    resultado: 0,
  }));
  for (const l of lancs) {
    const m = l.dataConfirmacao!.getMonth();
    const v = Number(l.valorEfetivo ?? l.valor);
    if (l.tipo === "receita") meses[m].receita += v;
    else meses[m].despesa += v;
  }
  for (const m of meses) m.resultado = m.receita - m.despesa;
  return meses;
}

/** Indicadores rápidos do período. */
export async function indicadores(de: Date, ate: Date) {
  const [projetosAtivos, recebido, aReceber] = await Promise.all([
    prisma.projeto.count({ where: { situacao: "em_andamento" } }),
    prisma.lancamento.aggregate({
      where: { tipo: "receita", status: "confirmado", dataConfirmacao: { gte: de, lte: ate } },
      _sum: { valor: true },
    }),
    prisma.lancamento.aggregate({
      where: { tipo: "receita", status: "previsto" },
      _sum: { valor: true },
    }),
  ]);
  return {
    projetosAtivos,
    recebido: Number(recebido._sum.valor ?? 0),
    aReceber: Number(aReceber._sum.valor ?? 0),
  };
}
