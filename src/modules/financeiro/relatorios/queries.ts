import "server-only";
import { formatarMesCurto } from "@/lib/utils";
import { subDays, differenceInCalendarDays } from "date-fns";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { fluxoCaixa } from "@/modules/financeiro/caixa/queries";
import { analisarDRE, type LinhaBaseDRE, type DREComparativo } from "./dre";
import { calcularRentabilidade, rentabilidadePorCliente, type ProjetoEntrada } from "./dre-projeto";

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
    rotulo: formatarMesCurto(new Date(ano, i, 1)),
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

export type FatiaCategoria = { nome: string; valor: number };

/** Nível de agrupamento da rosca de categorias. */
export type NivelCategoria = "raiz" | "subcategoria";

/**
 * Confirmados de um tipo agrupados por categoria no período. `nivel`:
 * - "raiz": categoria de nível 1 (ex.: "Despesas").
 * - "subcategoria": categoria de nível 2 (filha direta da raiz, ex.: "Folha CLT"),
 *   resolvida pela hierarquia `paiId` (lançamentos em sub-subcategorias sobem ao nível 2).
 * Retorna as `limite` maiores; o restante vira "Outros". Para gráfico de rosca.
 */
export async function totaisPorCategoria(
  tipo: "receita" | "despesa",
  de: Date,
  ate: Date,
  limite = 6,
  nivel: NivelCategoria = "raiz",
): Promise<{ fatias: FatiaCategoria[]; total: number }> {
  const [lancs, categorias] = await Promise.all([
    prisma.lancamento.findMany({
      where: { tipo, status: "confirmado", dataConfirmacao: { gte: de, lte: ate } },
      include: { categoria: { select: { id: true, codigo: true, nome: true } } },
    }),
    prisma.categoriaFinanceira.findMany({ select: { id: true, codigo: true, nome: true, paiId: true } }),
  ]);
  const nomePorCodigo = new Map(categorias.map((c) => [c.codigo, c.nome]));
  // Resolve, para cada categoria, o ancestral de nível 2 (filha direta da raiz):
  // sobe pela cadeia paiId até que o pai do nó seja a raiz (paiId === null).
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const nivel2 = new Map<string, { nome: string }>();
  for (const c of categorias) {
    let atual: typeof c | undefined = c;
    // Sobe enquanto houver avô (o pai tem pai) — ao parar, `atual` é a filha direta da raiz.
    while (atual?.paiId) {
      const pai = porId.get(atual.paiId);
      if (!pai || !pai.paiId) break; // pai é a raiz → `atual` é nível 2
      atual = pai;
    }
    // Se a própria categoria é raiz (sem pai), agrupa por ela mesma.
    nivel2.set(c.id, { nome: atual ? atual.nome : c.nome });
  }

  const mapa = new Map<string, number>();
  let total = 0;
  for (const l of lancs) {
    const nome =
      nivel === "subcategoria"
        ? (nivel2.get(l.categoria.id)?.nome ?? l.categoria.nome)
        : (nomePorCodigo.get(l.categoria.codigo.split(".")[0]) ?? l.categoria.nome);
    const v = Number(l.valorEfetivo ?? l.valor);
    mapa.set(nome, (mapa.get(nome) ?? 0) + v);
    total += v;
  }

  const ordenado = [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  const principais = ordenado.slice(0, limite).map(([nome, valor]) => ({ nome, valor }));
  const resto = ordenado.slice(limite).reduce((s, [, v]) => s + v, 0);
  if (resto > 0) principais.push({ nome: "Outros", valor: resto });

  return { fatias: principais, total };
}

/** Despesas confirmadas por subcategoria (filhas do plano de despesa) — rosca. */
export async function despesasPorCategoria(de: Date, ate: Date, limite = 6) {
  return totaisPorCategoria("despesa", de, ate, limite, "subcategoria");
}

export type MargemMensal = { mes: number; rotulo: string; receita: number; resultado: number; margem: number | null };

/** Série mensal (12 meses) de receita/resultado/margem% realizados — evolução da margem. */
export async function evolucaoMargemMensal(ano: number): Promise<MargemMensal[]> {
  const lancs = await prisma.lancamento.findMany({
    where: { status: "confirmado", dataConfirmacao: { gte: new Date(ano, 0, 1), lte: new Date(ano, 11, 31, 23, 59, 59) } },
    select: { tipo: true, valor: true, valorEfetivo: true, dataConfirmacao: true },
  });
  const acc = Array.from({ length: 12 }, () => ({ receita: 0, despesa: 0 }));
  for (const l of lancs) {
    if (!l.dataConfirmacao) continue;
    const v = Number(l.valorEfetivo ?? l.valor);
    if (l.tipo === "receita") acc[l.dataConfirmacao.getMonth()].receita += v;
    else acc[l.dataConfirmacao.getMonth()].despesa += v;
  }
  return acc.map((m, i) => {
    const resultado = m.receita - m.despesa;
    return {
      mes: i,
      rotulo: formatarMesCurto(new Date(ano, i, 1)),
      receita: Math.round(m.receita * 100) / 100,
      resultado: Math.round(resultado * 100) / 100,
      margem: m.receita > 0 ? Math.round((resultado / m.receita) * 1000) / 10 : null,
    };
  });
}

export type EvolucaoCategorias = {
  ano: number;
  meses: string[];
  categorias: { nome: string; valores: number[]; total: number }[];
};

/** Evolução mensal (12 meses do ano) por categoria de nível 1, para um tipo. Top N + "Outros". */
export async function evolucaoMensalCategorias(
  tipo: "receita" | "despesa",
  ano: number,
  limite = 6,
): Promise<EvolucaoCategorias> {
  const [lancs, categorias] = await Promise.all([
    prisma.lancamento.findMany({
      where: { tipo, status: "confirmado", dataConfirmacao: { gte: new Date(ano, 0, 1), lte: new Date(ano, 11, 31, 23, 59, 59) } },
      include: { categoria: { select: { codigo: true, nome: true } } },
    }),
    prisma.categoriaFinanceira.findMany({ select: { codigo: true, nome: true } }),
  ]);
  const nomePorCodigo = new Map(categorias.map((c) => [c.codigo, c.nome]));

  const mapa = new Map<string, number[]>();
  for (const l of lancs) {
    if (!l.dataConfirmacao) continue;
    const topo = l.categoria.codigo.split(".")[0];
    const nome = nomePorCodigo.get(topo) ?? l.categoria.nome;
    const arr = mapa.get(nome) ?? new Array<number>(12).fill(0);
    arr[l.dataConfirmacao.getMonth()] += Number(l.valorEfetivo ?? l.valor);
    mapa.set(nome, arr);
  }

  const linhas = [...mapa.entries()]
    .map(([nome, valores]) => ({ nome, valores, total: valores.reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.total - a.total);

  const principais = linhas.slice(0, limite);
  const resto = linhas.slice(limite);
  if (resto.length > 0) {
    const valores = new Array<number>(12).fill(0);
    for (const r of resto) r.valores.forEach((v, i) => (valores[i] += v));
    principais.push({ nome: "Outros", valores, total: valores.reduce((s, v) => s + v, 0) });
  }

  const meses = Array.from({ length: 12 }, (_, i) =>
    formatarMesCurto(new Date(ano, i, 1)),
  );
  return { ano, meses, categorias: principais };
}

export type ResultadoProjeto = {
  projetoId: string;
  codigo: string;
  nome: string;
  receita: number;
  despesa: number;
  resultado: number;
};

/**
 * Resultado por projeto no período (confirmados): receita, despesa e resultado de
 * cada projeto com movimento. Para o relatório "Lançamentos por projeto".
 */
export async function resultadoPorProjeto(de: Date, ate: Date): Promise<ResultadoProjeto[]> {
  const lancs = await prisma.lancamento.findMany({
    where: { status: "confirmado", dataConfirmacao: { gte: de, lte: ate }, projetoId: { not: null } },
    include: { projeto: { select: { id: true, codigo: true, nome: true } } },
  });
  const mapa = new Map<string, ResultadoProjeto>();
  for (const l of lancs) {
    if (!l.projeto) continue;
    const cur =
      mapa.get(l.projeto.id) ??
      { projetoId: l.projeto.id, codigo: l.projeto.codigo, nome: l.projeto.nome, receita: 0, despesa: 0, resultado: 0 };
    const v = Number(l.valorEfetivo ?? l.valor);
    if (l.tipo === "receita") cur.receita += v;
    else cur.despesa += v;
    cur.resultado = cur.receita - cur.despesa;
    mapa.set(l.projeto.id, cur);
  }
  return [...mapa.values()].sort((a, b) => b.resultado - a.resultado);
}

/**
 * Rentabilidade (DRE) por projeto no período: receita e custos diretos por projeto,
 * custos indiretos (despesas sem projeto) rateados pela receita, lucro/margem/ROI,
 * ranking de clientes e alertas de margem abaixo do mínimo.
 */
export async function rentabilidadePorProjeto(de: Date, ate: Date, margemMinima = 0) {
  const lancs = await prisma.lancamento.findMany({
    where: { status: "confirmado", dataConfirmacao: { gte: de, lte: ate } },
    include: { projeto: { select: { id: true, codigo: true, nome: true, cliente: { select: { nome: true } } } } },
  });

  const mapa = new Map<string, ProjetoEntrada>();
  let totalIndireto = 0;
  for (const l of lancs) {
    const v = Number(l.valorEfetivo ?? l.valor);
    if (!l.projeto) {
      if (l.tipo === "despesa") totalIndireto += v; // overhead a ratear
      continue;
    }
    const cur =
      mapa.get(l.projeto.id) ??
      {
        projetoId: l.projeto.id,
        codigo: l.projeto.codigo,
        nome: l.projeto.nome,
        cliente: l.projeto.cliente?.nome ?? null,
        receita: 0,
        diretos: 0,
      };
    if (l.tipo === "receita") cur.receita += v;
    else cur.diretos += v;
    mapa.set(l.projeto.id, cur);
  }

  const resultado = calcularRentabilidade([...mapa.values()], totalIndireto, margemMinima);
  return {
    de: de.toISOString().slice(0, 10),
    ate: ate.toISOString().slice(0, 10),
    margemMinima,
    ...resultado,
    clientes: rentabilidadePorCliente(resultado.projetos),
  };
}
export type RentabilidadeRelatorio = Awaited<ReturnType<typeof rentabilidadePorProjeto>>;

export type CustoDisciplina = { disciplinaId: string; nome: string; projeto: string; orcado: number; pago: number; saldo: number };

/** Custo por disciplina no período: orçado (Disciplina.valor) × pago (PagamentoProjetista). */
export async function custoPorDisciplina(de: Date, ate: Date): Promise<CustoDisciplina[]> {
  const pagamentos = await prisma.pagamentoProjetista.findMany({
    where: { liberadoEm: { gte: de, lte: ate } },
    include: { disciplina: { select: { id: true, nome: true, valor: true, projeto: { select: { codigo: true, nome: true } } } } },
  });
  const mapa = new Map<string, CustoDisciplina>();
  for (const p of pagamentos) {
    const d = p.disciplina;
    const cur =
      mapa.get(d.id) ??
      { disciplinaId: d.id, nome: d.nome, projeto: `${d.projeto.codigo} ${d.projeto.nome}`, orcado: Number(d.valor ?? 0), pago: 0, saldo: 0 };
    cur.pago += Number(p.valor);
    mapa.set(d.id, cur);
  }
  for (const c of mapa.values()) c.saldo = Math.round((c.orcado - c.pago) * 100) / 100;
  return [...mapa.values()].sort((a, b) => b.pago - a.pago);
}

/** Mapa projetoId → nome do coordenador (membro do projeto com papel "coordenador"). */
export async function coordenadoresPorProjeto(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const membros = await prisma.projetoMembro.findMany({
    where: { projetoId: { in: ids }, papel: { contains: "coorden", mode: "insensitive" } },
    include: { user: { select: { name: true } } },
  });
  const map: Record<string, string> = {};
  for (const m of membros) if (!map[m.projetoId]) map[m.projetoId] = m.user.name;
  return map;
}

/** Base do DRE: caixa (data de confirmação) ou competência (data de competência, ou `data`). */
export type BaseDRE = "caixa" | "competencia";

/** Linhas do DRE (confirmados, agrupados por categoria) de um período — base do comparativo. */
async function linhasDREPeriodo(de: Date, ate: Date, base: BaseDRE): Promise<LinhaBaseDRE[]> {
  const where: Prisma.LancamentoWhereInput =
    base === "competencia"
      ? {
          status: "confirmado",
          OR: [
            { dataCompetencia: { gte: de, lte: ate } },
            { dataCompetencia: null, data: { gte: de, lte: ate } },
          ],
        }
      : { status: "confirmado", dataConfirmacao: { gte: de, lte: ate } };
  const lancamentos = await prisma.lancamento.findMany({
    where,
    include: { categoria: { select: { codigo: true, nome: true, tipo: true, grupoDfc: true } } },
  });
  const mapa = new Map<string, LinhaBaseDRE>();
  for (const l of lancamentos) {
    const c = l.categoria;
    const cur = mapa.get(c.codigo) ?? { codigo: c.codigo, nome: c.nome, tipo: c.tipo, grupoDfc: c.grupoDfc, valor: 0 };
    cur.valor += Number(l.valorEfetivo ?? l.valor);
    mapa.set(c.codigo, cur);
  }
  return [...mapa.values()];
}

/**
 * DRE comparativo: período atual + período imediatamente anterior de mesma duração,
 * com análise vertical (AV%), horizontal (AH%) e EBITDA gerencial.
 */
export async function relatorioDREComparativo(de: Date, ate: Date, base: BaseDRE = "caixa"): Promise<DREComparativo> {
  const dias = differenceInCalendarDays(ate, de) + 1;
  const ateAnt = subDays(de, 1);
  const deAnt = subDays(ateAnt, dias - 1);
  const [atuais, anteriores] = await Promise.all([
    linhasDREPeriodo(de, ate, base),
    linhasDREPeriodo(deAnt, ateAnt, base),
  ]);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return analisarDRE(atuais, anteriores, {
    de: iso(de),
    ate: iso(ate),
    deAnt: iso(deAnt),
    ateAnt: iso(ateAnt),
  });
}
