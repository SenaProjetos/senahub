import "server-only";
import { utcInicioDoDia, utcFimDoDia } from "@/lib/data";
import { formatarMesCurto } from "@/lib/utils";
import { subDays, differenceInCalendarDays } from "date-fns";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { fluxoCaixa } from "@/modules/financeiro/caixa/queries";
import { totalDaCarteira } from "@/modules/financeiro/investimentos/queries";
import { idsContasDeInvestimento } from "@/modules/financeiro/investimentos/service";
import { SEM_TRANSFERENCIA, SO_RESULTADO } from "@/modules/financeiro/natureza";
import { somaPaga, somarReais, valorPagoReais } from "@/modules/financeiro/valor-pago";
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
    where: { status: "confirmado", dataConfirmacao: { gte: de, lte: ate }, ...SEM_TRANSFERENCIA },
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
    const v = valorPagoReais(l);
    cur.valor = somarReais(cur.valor, l.tipo === "receita" ? v : -v);
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
  const [{ saldoTotal }, aReceberAgg, aPagarAgg, investimentos] = await Promise.all([
    fluxoCaixa(1),
    prisma.lancamento.aggregate({ where: { tipo: "receita", status: "previsto", ...SEM_TRANSFERENCIA }, _sum: { valor: true } }),
    prisma.lancamento.aggregate({ where: { tipo: "despesa", status: "previsto", ...SEM_TRANSFERENCIA }, _sum: { valor: true } }),
    // M4: o valor atual da carteira (saldo das contas dos ativos) entra no ativo, separado do caixa.
    totalDaCarteira(),
  ]);
  const caixa = saldoTotal;
  const aReceber = Number(aReceberAgg._sum.valor ?? 0);
  const aPagar = Number(aPagarAgg._sum.valor ?? 0);
  const ativo = caixa + investimentos + aReceber;
  const passivo = aPagar;
  return { caixa, investimentos, aReceber, aPagar, ativo, passivo, pl: ativo - passivo };
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
    where: { status: "confirmado", dataConfirmacao: { gte: de, lte: ate }, ...SO_RESULTADO },
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
    cur.valor = somarReais(cur.valor, valorPagoReais(l));
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
  const ano = de.getUTCFullYear();
  const [lancamentos, itens] = await Promise.all([
    prisma.lancamento.findMany({
      // O orçamento planeja RESULTADO: distribuição de lucros e transferência não são gasto a orçar.
      where: { data: { gte: de, lte: ate }, ...SO_RESULTADO },
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
    if (l.status === "confirmado") cur.realizado = somarReais(cur.realizado, valorPagoReais(l));
    else if (l.status === "previsto") cur.previsto = somarReais(cur.previsto, Number(l.valor));
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
      dataConfirmacao: { gte: utcInicioDoDia(ano, 0), lte: utcFimDoDia(ano, 11, 31) },
      ...SO_RESULTADO,
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
    const m = l.dataConfirmacao!.getUTCMonth();
    const v = valorPagoReais(l);
    if (l.tipo === "receita") meses[m].receita = somarReais(meses[m].receita, v);
    else meses[m].despesa = somarReais(meses[m].despesa, v);
  }
  for (const m of meses) m.resultado = m.receita - m.despesa;
  return meses;
}

/** Indicadores rápidos do período. */
export async function indicadores(de: Date, ate: Date) {
  // M4: rendimento lançado na conta de um investimento é receita (DRE), mas não ENTROU no caixa — fica fora do "Recebido".
  const contasDeAtivo = await idsContasDeInvestimento();
  const [projetosAtivos, recebido, aReceber] = await Promise.all([
    prisma.projeto.count({ where: { situacao: "em_andamento" } }),
    // Recebido = o que entrou (`valorEfetivo` do parcial/desconto vence o nominal), somado linha a linha.
    prisma.lancamento.findMany({
      where: {
        tipo: "receita",
        status: "confirmado",
        dataConfirmacao: { gte: de, lte: ate },
        ...SO_RESULTADO,
        ...(contasDeAtivo.length ? { OR: [{ contaId: null }, { contaId: { notIn: contasDeAtivo } }] } : {}),
      },
      select: { valor: true, valorEfetivo: true },
    }),
    prisma.lancamento.aggregate({
      where: { tipo: "receita", status: "previsto", ...SO_RESULTADO },
      _sum: { valor: true },
    }),
  ]);
  return {
    projetosAtivos,
    recebido: somaPaga(recebido),
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
      where: { tipo, status: "confirmado", dataConfirmacao: { gte: de, lte: ate }, ...SO_RESULTADO },
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
    const v = valorPagoReais(l);
    mapa.set(nome, (mapa.get(nome) ?? 0) + v);
    total = somarReais(total, v);
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
    where: { status: "confirmado", dataConfirmacao: { gte: utcInicioDoDia(ano, 0), lte: utcFimDoDia(ano, 11, 31) }, ...SO_RESULTADO },
    select: { tipo: true, valor: true, valorEfetivo: true, dataConfirmacao: true },
  });
  const acc = Array.from({ length: 12 }, () => ({ receita: 0, despesa: 0 }));
  for (const l of lancs) {
    if (!l.dataConfirmacao) continue;
    const v = valorPagoReais(l);
    if (l.tipo === "receita") acc[l.dataConfirmacao.getUTCMonth()].receita = somarReais(acc[l.dataConfirmacao.getUTCMonth()].receita, v);
    else acc[l.dataConfirmacao.getUTCMonth()].despesa = somarReais(acc[l.dataConfirmacao.getUTCMonth()].despesa, v);
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
      where: { tipo, status: "confirmado", dataConfirmacao: { gte: utcInicioDoDia(ano, 0), lte: utcFimDoDia(ano, 11, 31) }, ...SO_RESULTADO },
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
    arr[l.dataConfirmacao.getUTCMonth()] = somarReais(arr[l.dataConfirmacao.getUTCMonth()], valorPagoReais(l));
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
    where: { status: "confirmado", dataConfirmacao: { gte: de, lte: ate }, projetoId: { not: null }, ...SO_RESULTADO },
    include: { projeto: { select: { id: true, codigo: true, nome: true } } },
  });
  const mapa = new Map<string, ResultadoProjeto>();
  for (const l of lancs) {
    if (!l.projeto) continue;
    const cur =
      mapa.get(l.projeto.id) ??
      { projetoId: l.projeto.id, codigo: l.projeto.codigo, nome: l.projeto.nome, receita: 0, despesa: 0, resultado: 0 };
    const v = valorPagoReais(l);
    if (l.tipo === "receita") cur.receita = somarReais(cur.receita, v);
    else cur.despesa = somarReais(cur.despesa, v);
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
    where: { status: "confirmado", dataConfirmacao: { gte: de, lte: ate }, ...SO_RESULTADO },
    include: { projeto: { select: { id: true, codigo: true, nome: true, cliente: { select: { nome: true } } } } },
  });

  const mapa = new Map<string, ProjetoEntrada>();
  let totalIndireto = 0;
  for (const l of lancs) {
    const v = valorPagoReais(l);
    if (!l.projeto) {
      if (l.tipo === "despesa") totalIndireto = somarReais(totalIndireto, v); // overhead a ratear
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
    if (l.tipo === "receita") cur.receita = somarReais(cur.receita, v);
    else cur.diretos = somarReais(cur.diretos, v);
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
    include: { disciplina: { select: { id: true, disciplinaTextoLegado: true, valor: true, projeto: { select: { codigo: true, nome: true } } } } },
  });
  const mapa = new Map<string, CustoDisciplina>();
  for (const p of pagamentos) {
    const d = p.disciplina;
    const cur =
      mapa.get(d.id) ??
      { disciplinaId: d.id, nome: d.disciplinaTextoLegado, projeto: `${d.projeto.codigo} ${d.projeto.nome}`, orcado: Number(d.valor ?? 0), pago: 0, saldo: 0 };
    cur.pago = somarReais(cur.pago, Number(p.valor));
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
          ...SO_RESULTADO,
          status: "confirmado",
          OR: [
            { dataCompetencia: { gte: de, lte: ate } },
            { dataCompetencia: null, data: { gte: de, lte: ate } },
          ],
        }
      : { ...SO_RESULTADO, status: "confirmado", dataConfirmacao: { gte: de, lte: ate } };
  // natureza-ok: o `where` acima já leva SO_RESULTADO nos dois ramos (caixa e competência).
  const lancamentos = await prisma.lancamento.findMany({
    where,
    include: { categoria: { select: { codigo: true, nome: true, tipo: true, grupoDfc: true } } },
  });
  const mapa = new Map<string, LinhaBaseDRE>();
  for (const l of lancamentos) {
    const c = l.categoria;
    const cur = mapa.get(c.codigo) ?? { codigo: c.codigo, nome: c.nome, tipo: c.tipo, grupoDfc: c.grupoDfc, valor: 0 };
    cur.valor = somarReais(cur.valor, valorPagoReais(l));
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

// ───────────────────────── M6: Indicadores, relatório por dimensão, orçamento por centro ─────────────────────────

import { baseDoPlanejador } from "@/modules/financeiro/liquidez/queries";
import { diasDeCaixa, type DiasDeCaixa } from "@/modules/financeiro/liquidez/indicadores";
import { agingReport } from "@/modules/financeiro/aging/queries";
import { somarMesesUtc } from "@/lib/data";
import {
  margemLiquida,
  percentualInadimplencia,
  pontoDeEquilibrio,
  prazoMedioDias,
  receitaPorProjetoAtivo,
  variacaoPontosPercentuais,
} from "@/modules/financeiro/relatorios/indicadores-gerenciais";

export type IndicadoresGerenciais = {
  margemLiquida: number | null;
  margemLiquidaAnterior: number | null;
  margemDeltaPontos: number | null;
  resultadoOperacional: number;
  diasDeCaixa: DiasDeCaixa;
  inadimplencia12Meses: number | null;
  prazoMedioRecebimento: number | null;
  prazoMedioPagamento: number | null;
  pontoDeEquilibrio: number;
  receitaPorProjetoAtivo: number | null;
  projetosAtivos: number;
};

/**
 * Os 8 indicadores da tela "Indicadores" (M6, mock aprovado). `de`/`ate` é o mês (ou período) em avaliação; o
 * anterior é o mesmo número de dias imediatamente antes (mesma regra do DRE comparativo).
 */
export async function indicadoresGerenciais(de: Date, ate: Date): Promise<IndicadoresGerenciais> {
  const dias = differenceInCalendarDays(ate, de) + 1;
  const ateAnt = subDays(de, 1);
  const deAnt = subDays(ateAnt, dias - 1);
  const ha12Meses = somarMesesUtc(ate, -12);

  const [atuais, anteriores, base, agingReceita, faturado12m, recebimentos, pagamentos, projetosAtivos] = await Promise.all([
    linhasDREPeriodo(de, ate, "competencia"),
    linhasDREPeriodo(deAnt, ateAnt, "competencia"),
    baseDoPlanejador({ horizonteDias: 30 }),
    agingReport("receita"),
    prisma.lancamento.aggregate({
      where: { tipo: "receita", status: "confirmado", dataConfirmacao: { gte: ha12Meses, lte: ate }, ...SO_RESULTADO },
      _sum: { valor: true },
    }),
    // Prazo médio de recebimento: da data do lançamento (emissão) ao recebimento, receitas confirmadas no período.
    prisma.lancamento.findMany({
      where: { tipo: "receita", status: "confirmado", dataConfirmacao: { gte: de, lte: ate }, ...SO_RESULTADO },
      select: { data: true, dataConfirmacao: true },
    }),
    prisma.lancamento.findMany({
      where: { tipo: "despesa", status: "confirmado", dataConfirmacao: { gte: de, lte: ate }, ...SO_RESULTADO },
      select: { data: true, dataConfirmacao: true },
    }),
    prisma.projeto.count({ where: { situacao: "em_andamento" } }),
  ]);

  const totAtual = { receita: somaLinhas(atuais, "receita"), despesa: somaLinhas(atuais, "despesa") };
  const totAnterior = { receita: somaLinhas(anteriores, "receita"), despesa: somaLinhas(anteriores, "despesa") };
  const resultadoAtual = totAtual.receita - totAtual.despesa;
  const resultadoAnterior = totAnterior.receita - totAnterior.despesa;
  const margemAtual = margemLiquida(totAtual.receita, resultadoAtual);
  const margemAnterior = margemLiquida(totAnterior.receita, resultadoAnterior);

  // Inadimplência: vencido há mais de 30 dias (todas as faixas de aging exceto "a vencer" e "1-30").
  const vencidoMais30 = agingReceita.porFaixa
    .filter((f) => f.faixa !== "a_vencer" && f.faixa !== "d1_30")
    .reduce((s, f) => s + f.total, 0);

  const diasEntreDatas = (ls: { data: Date; dataConfirmacao: Date | null }[]) =>
    ls.flatMap((l) => (l.dataConfirmacao ? [{ dias: differenceInCalendarDays(l.dataConfirmacao, l.data) }] : []));

  return {
    margemLiquida: margemAtual,
    margemLiquidaAnterior: margemAnterior,
    margemDeltaPontos: variacaoPontosPercentuais(margemAtual, margemAnterior),
    resultadoOperacional: Math.round(resultadoAtual * 100) / 100,
    diasDeCaixa: diasDeCaixa({ caixaAtual: base.caixaAtual, ...base.historico }),
    inadimplencia12Meses: percentualInadimplencia(vencidoMais30, Number(faturado12m._sum.valor ?? 0)),
    prazoMedioRecebimento: prazoMedioDias(diasEntreDatas(recebimentos)),
    prazoMedioPagamento: prazoMedioDias(diasEntreDatas(pagamentos)),
    pontoDeEquilibrio: pontoDeEquilibrio(totAtual.despesa),
    receitaPorProjetoAtivo: receitaPorProjetoAtivo(totAtual.receita, projetosAtivos),
    projetosAtivos,
  };
}

function somaLinhas(ls: LinhaBaseDRE[], tipo: "receita" | "despesa"): number {
  return ls.filter((l) => l.tipo === tipo).reduce((s, l) => s + l.valor, 0);
}

export type MesEvolucao = MesResultado & { margem: number | null; de: string; ate: string };

/**
 * Receita × despesa dos últimos `n` meses terminando em `ateMes` (janela ROLANTE, diferente de
 * `serieMensalResultado` que é o ano-calendário inteiro) — "Evolução mês a mês" do mock de Indicadores.
 */
export async function evolucaoReceitaDespesaMeses(ateMes: Date, n = 6): Promise<MesEvolucao[]> {
  const inicio = somarMesesUtc(utcInicioDoDia(ateMes.getUTCFullYear(), ateMes.getUTCMonth()), -(n - 1));
  const fim = utcFimDoDia(ateMes.getUTCFullYear(), ateMes.getUTCMonth() + 1, 0);
  const lancs = await prisma.lancamento.findMany({
    where: { status: "confirmado", dataConfirmacao: { gte: inicio, lte: fim }, ...SO_RESULTADO },
    select: { tipo: true, valor: true, valorEfetivo: true, dataConfirmacao: true },
  });
  const meses: MesEvolucao[] = Array.from({ length: n }, (_, i) => {
    const d = somarMesesUtc(inicio, i);
    const fimDoMes = utcFimDoDia(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
    return {
      mes: d.getUTCMonth(),
      rotulo: formatarMesCurto(d),
      receita: 0,
      despesa: 0,
      resultado: 0,
      margem: null,
      de: d.toISOString().slice(0, 10),
      ate: fimDoMes.toISOString().slice(0, 10),
    };
  });
  const indicePorChave = new Map(meses.map((m, i) => [`${somarMesesUtc(inicio, i).getUTCFullYear()}-${m.mes}`, i]));
  for (const l of lancs) {
    if (!l.dataConfirmacao) continue;
    const chave = `${l.dataConfirmacao.getUTCFullYear()}-${l.dataConfirmacao.getUTCMonth()}`;
    const i = indicePorChave.get(chave);
    if (i == null) continue;
    const v = valorPagoReais(l);
    if (l.tipo === "receita") meses[i].receita = somarReais(meses[i].receita, v);
    else meses[i].despesa = somarReais(meses[i].despesa, v);
  }
  for (const m of meses) {
    m.resultado = Math.round((m.receita - m.despesa) * 100) / 100;
    m.margem = margemLiquida(m.receita, m.resultado);
  }
  return meses;
}

export type DimensaoRelatorio = "categoria" | "centro" | "contato" | "projeto" | "tag";
export type LinhaDimensao = { chave: string; nome: string; receita: number; despesa: number; resultado: number; qtd: number };
export type RelatorioPorDimensao = { dimensao: DimensaoRelatorio; de: string; ate: string; linhas: LinhaDimensao[]; semDimensao: number };

/**
 * Confirmados do período agrupados pela dimensão escolhida. `tag` é especial: um lançamento com 2 tags entra
 * nas duas linhas (a soma das linhas pode passar do total) — a tela avisa isso. As demais dimensões são 1:1.
 */
export async function relatorioPorDimensao(dimensao: DimensaoRelatorio, de: Date, ate: Date): Promise<RelatorioPorDimensao> {
  const lancs = await prisma.lancamento.findMany({
    where: { status: "confirmado", dataConfirmacao: { gte: de, lte: ate }, ...SO_RESULTADO },
    select: {
      tipo: true,
      valor: true,
      valorEfetivo: true,
      tags: true,
      categoria: { select: { id: true, codigo: true, nome: true } },
      centro: { select: { id: true, nome: true } },
      projeto: { select: { id: true, codigo: true, nome: true } },
      fornecedor: { select: { id: true, nome: true } },
      cliente: { select: { id: true, nome: true } },
    },
  });

  const mapa = new Map<string, LinhaDimensao>();
  let semDimensao = 0;
  const linha = (chave: string, nome: string) => {
    const cur = mapa.get(chave) ?? { chave, nome, receita: 0, despesa: 0, resultado: 0, qtd: 0 };
    mapa.set(chave, cur);
    return cur;
  };
  const somar = (cur: LinhaDimensao, l: (typeof lancs)[number]) => {
    const v = valorPagoReais(l);
    if (l.tipo === "receita") cur.receita = somarReais(cur.receita, v);
    else cur.despesa = somarReais(cur.despesa, v);
    cur.qtd += 1;
  };

  for (const l of lancs) {
    if (dimensao === "tag") {
      if (l.tags.length === 0) {
        semDimensao += 1;
        continue;
      }
      for (const t of l.tags) somar(linha(t, t), l);
      continue;
    }
    if (dimensao === "categoria") {
      somar(linha(l.categoria.id, `${l.categoria.codigo} ${l.categoria.nome}`), l);
      continue;
    }
    if (dimensao === "centro") {
      if (!l.centro) {
        semDimensao += 1;
        continue;
      }
      somar(linha(l.centro.id, l.centro.nome), l);
      continue;
    }
    if (dimensao === "projeto") {
      if (!l.projeto) {
        semDimensao += 1;
        continue;
      }
      somar(linha(l.projeto.id, `${l.projeto.codigo} ${l.projeto.nome}`), l);
      continue;
    }
    // contato: fornecedor (despesa) ou cliente (receita) — o que existir.
    const contato = l.fornecedor ?? l.cliente;
    if (!contato) {
      semDimensao += 1;
      continue;
    }
    somar(linha(contato.id, contato.nome), l);
  }

  for (const l of mapa.values()) l.resultado = Math.round((l.receita - l.despesa) * 100) / 100;
  const linhas = [...mapa.values()].sort((a, b) => b.receita + b.despesa - (a.receita + a.despesa));
  return { dimensao, de: de.toISOString().slice(0, 10), ate: ate.toISOString().slice(0, 10), linhas, semDimensao };
}

export type LinhaOrcamentoCentro = { centroId: string | null; nome: string; previsto: number; realizado: number };

/**
 * Previsto × realizado por CENTRO DE CUSTO (despesas do resultado). Só leitura — ao contrário do orçamento por
 * categoria, não há valor PLANEJADO guardado por centro (seria uma 2ª tabela/migração para uma necessidade
 * marcada como baixa prioridade na auditoria); esta tela compara o que já está previsto/realizado.
 */
export async function orcamentoPorCentro(de: Date, ate: Date): Promise<LinhaOrcamentoCentro[]> {
  const lancs = await prisma.lancamento.findMany({
    where: { tipo: "despesa", data: { gte: de, lte: ate }, ...SO_RESULTADO },
    select: { valor: true, valorEfetivo: true, status: true, centro: { select: { id: true, nome: true } } },
  });
  const mapa = new Map<string, LinhaOrcamentoCentro>();
  for (const l of lancs) {
    const chave = l.centro?.id ?? "__sem";
    const cur = mapa.get(chave) ?? { centroId: l.centro?.id ?? null, nome: l.centro?.nome ?? "Sem centro de custo", previsto: 0, realizado: 0 };
    if (l.status === "confirmado") cur.realizado = somarReais(cur.realizado, valorPagoReais(l));
    else if (l.status === "previsto") cur.previsto = somarReais(cur.previsto, Number(l.valor));
    mapa.set(chave, cur);
  }
  return [...mapa.values()].sort((a, b) => b.realizado + b.previsto - (a.realizado + a.previsto));
}
