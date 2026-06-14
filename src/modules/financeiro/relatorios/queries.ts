import "server-only";
import { prisma } from "@/lib/prisma";
import { fluxoCaixa } from "@/modules/financeiro/caixa/queries";

const GRUPOS_DFC = ["operacional", "investimento", "financiamento"] as const;
export type GrupoDFC = (typeof GRUPOS_DFC)[number];
export type AtividadeDFC = {
  grupo: GrupoDFC;
  entradas: number;
  saidas: number;
  liquido: number;
  linhas: { codigo: string; nome: string; valor: number }[];
};

/** DFC método direto: movimentos confirmados no período por atividade (grupoDfc da categoria). */
export async function relatorioDFC(de: Date, ate: Date) {
  const lancs = await prisma.lancamento.findMany({
    where: { status: "confirmado", dataConfirmacao: { gte: de, lte: ate } },
    include: { categoria: { select: { codigo: true, nome: true, tipo: true, grupoDfc: true } } },
  });
  const mapa = new Map<GrupoDFC, Map<string, { codigo: string; nome: string; valor: number }>>();
  for (const g of GRUPOS_DFC) mapa.set(g, new Map());
  for (const l of lancs) {
    const g = (GRUPOS_DFC as readonly string[]).includes(l.categoria.grupoDfc ?? "")
      ? (l.categoria.grupoDfc as GrupoDFC)
      : "operacional";
    const bucket = mapa.get(g)!;
    const cur = bucket.get(l.categoria.codigo) ?? { codigo: l.categoria.codigo, nome: l.categoria.nome, valor: 0 };
    const v = Number(l.valorEfetivo ?? l.valor);
    cur.valor += l.tipo === "receita" ? v : -v;
    bucket.set(l.categoria.codigo, cur);
  }
  const atividades: AtividadeDFC[] = GRUPOS_DFC.map((grupo) => {
    const linhas = [...mapa.get(grupo)!.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
    const entradas = linhas.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
    const saidas = linhas.filter((l) => l.valor < 0).reduce((s, l) => s - l.valor, 0);
    return { grupo, entradas, saidas, liquido: entradas - saidas, linhas };
  });
  return { de: de.toISOString().slice(0, 10), ate: ate.toISOString().slice(0, 10), atividades, variacao: atividades.reduce((s, a) => s + a.liquido, 0) };
}

/** Categorias p/ classificação no DFC. */
export async function categoriasParaDfc() {
  const cats = await prisma.categoriaFinanceira.findMany({
    where: { ativo: true },
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, nome: true, tipo: true, grupoDfc: true },
  });
  return cats.map((c) => ({ ...c, grupoDfc: c.grupoDfc ?? "operacional" }));
}

/**
 * Balanço gerencial (simplificado, base caixa): caixa + a receber = ativo;
 * a pagar = passivo; PL = ativo − passivo. NÃO é Balanço contábil formal (sem partidas dobradas).
 */
export async function balancoGerencial() {
  const [{ saldoTotal }, aReceberAgg, aPagarAgg] = await Promise.all([
    fluxoCaixa(1),
    prisma.lancamento.aggregate({ where: { tipo: "receita", status: "previsto" }, _sum: { valor: true } }),
    prisma.lancamento.aggregate({ where: { tipo: "despesa", status: "previsto" }, _sum: { valor: true } }),
  ]);
  const caixa = saldoTotal;
  const aReceber = Number(aReceberAgg._sum.valor ?? 0);
  const aPagar = Number(aPagarAgg._sum.valor ?? 0);
  const ativo = caixa + aReceber;
  const passivo = aPagar;
  return { caixa, aReceber, aPagar, ativo, passivo, pl: ativo - passivo };
}

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
  categoriaId: string;
  codigo: string;
  nome: string;
  tipo: string;
  planejado: number;
  previsto: number;
  realizado: number;
};
export type Orcamento = {
  de: string;
  ate: string;
  receitas: LinhaOrcamento[];
  despesas: LinhaOrcamento[];
  totais: {
    receitaPlanejada: number;
    receitaPrevista: number;
    receitaRealizada: number;
    despesaPlanejada: number;
    despesaPrevista: number;
    despesaRealizada: number;
  };
};

/**
 * Orçamento por categoria no período (por competência `data`):
 * planejado = orçado para o ano (OrcamentoItem); previsto = lançamentos previstos;
 * realizado = confirmados (valorEfetivo). Inclui categorias só orçadas (sem lançamento).
 */
export async function orcamentoPorCategoria(de: Date, ate: Date): Promise<Orcamento> {
  const ano = de.getFullYear();
  const [lancamentos, itens] = await Promise.all([
    prisma.lancamento.findMany({
      where: { data: { gte: de, lte: ate } },
      include: { categoria: { select: { id: true, codigo: true, nome: true, tipo: true } } },
    }),
    prisma.orcamentoItem.findMany({
      where: { ano },
      include: { categoria: { select: { id: true, codigo: true, nome: true, tipo: true } } },
    }),
  ]);

  const mapa = new Map<string, LinhaOrcamento>();
  const novaLinha = (c: { id: string; codigo: string; nome: string; tipo: string }): LinhaOrcamento => ({
    categoriaId: c.id,
    codigo: c.codigo,
    nome: c.nome,
    tipo: c.tipo,
    planejado: 0,
    previsto: 0,
    realizado: 0,
  });

  for (const l of lancamentos) {
    const c = l.categoria;
    const cur = mapa.get(c.id) ?? novaLinha(c);
    if (l.status === "confirmado") cur.realizado += Number(l.valorEfetivo ?? l.valor);
    else if (l.status === "previsto") cur.previsto += Number(l.valor);
    mapa.set(c.id, cur);
  }
  for (const it of itens) {
    const c = it.categoria;
    const cur = mapa.get(c.id) ?? novaLinha(c);
    cur.planejado = Number(it.valorPlanejado);
    mapa.set(c.id, cur);
  }

  const linhas = [...mapa.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const receitas = linhas.filter((l) => l.tipo === "receita");
  const despesas = linhas.filter((l) => l.tipo === "despesa");
  const soma = (arr: LinhaOrcamento[], campo: "planejado" | "previsto" | "realizado") =>
    arr.reduce((s, l) => s + l[campo], 0);

  return {
    de: de.toISOString().slice(0, 10),
    ate: ate.toISOString().slice(0, 10),
    receitas,
    despesas,
    totais: {
      receitaPlanejada: soma(receitas, "planejado"),
      receitaPrevista: soma(receitas, "previsto"),
      receitaRealizada: soma(receitas, "realizado"),
      despesaPlanejada: soma(despesas, "planejado"),
      despesaPrevista: soma(despesas, "previsto"),
      despesaRealizada: soma(despesas, "realizado"),
    },
  };
}

/** Categorias ativas para adicionar ao orçamento. */
export async function categoriasFinanceiras() {
  const cs = await prisma.categoriaFinanceira.findMany({
    where: { ativo: true },
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, nome: true, tipo: true },
  });
  return cs;
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
