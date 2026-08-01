import "server-only";
import { prisma } from "@/lib/prisma";
import { montarArvore, calcularCodigosWbs, type NoOrcamento } from "../orcamento-arvore";
import {
  linhasSinteticas,
  linhasAnaliticas,
  resumoPorGrupo,
  totaisGerais,
  type ContextoPlanilha,
  type ItemComposicaoResolvido,
  type LinhaPlanilha,
  type ResumoGrupo,
} from "./planilha-orcamento";

export type ItemArvore = {
  id: string;
  parentId: string | null;
  tipo: "grupo" | "servico";
  codigo: string;
  ordem: number;
  nivel: number;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  custoUnitario: number;
  custoUnitarioComBdi: number;
  bdiPercentual: number | null;
  bdiEfetivo: number;
  bloqueado: boolean;
  totalSemBdi: number;
  totalComBdi: number;
  composicaoId: string | null;
  composicaoCodigo: string | null;
  insumoId: string | null;
  insumoCodigo: string | null;
  bancoNome: string | null;
  custoCalculadoEm: Date | null;
};

export type ArvoreOrcamento = {
  itens: ItemArvore[];
  totalSemBdi: number;
  totalComBdi: number;
  resumoGrupos: ResumoGrupo[];
  erro: string | null;
};

/** Árvore completa do orçamento em UMA query + montagem em memória (sem N+1). */
export async function arvoreDoOrcamento(orcamentoId: string): Promise<ArvoreOrcamento> {
  const [orc, linhas] = await Promise.all([
    prisma.custoOrcamento.findUnique({ where: { id: orcamentoId }, select: { bdiPercentual: true } }),
    prisma.custoOrcamentoItem.findMany({
      where: { orcamentoId },
      include: {
        composicao: { select: { codigo: true } },
        insumo: { select: { codigo: true } },
        basePrecoUsada: { select: { nome: true, fonte: true } },
      },
    }),
  ]);

  const bdiOrcamento = orc?.bdiPercentual === null || orc?.bdiPercentual === undefined ? 0 : Number(orc.bdiPercentual);

  const nos: NoOrcamento[] = linhas.map((l) => ({
    id: l.id,
    parentId: l.parentId,
    tipo: l.tipo,
    ordem: l.ordem,
    quantidade: Number(l.quantidade),
    custoUnitario: Number(l.custoUnitario),
    bdiPercentual: l.bdiPercentual === null ? null : Number(l.bdiPercentual),
    bloqueado: l.bloqueado,
  }));

  const arv = montarArvore(nos);
  if (!arv.ok) {
    return { itens: [], totalSemBdi: 0, totalComBdi: 0, resumoGrupos: [], erro: arv.erro };
  }

  const codigos = calcularCodigosWbs(arv.raizes);
  const totais = new Map(
    linhas.map((l) => [l.id, { totalSemBdi: Number(l.totalSemBdi), totalComBdi: Number(l.totalComBdi) }]),
  );
  const meta = new Map(linhas.map((l) => [l.id, { descricao: l.descricao, unidade: l.unidade }]));
  const ctx: ContextoPlanilha = { bdiOrcamento, totais, codigos, meta };

  const porId = new Map(linhas.map((l) => [l.id, l]));
  // Índice invertido montado UMA vez — buscar o id por código dentro do map seria O(n²).
  const idPorCodigo = new Map([...codigos].map(([id, codigo]) => [codigo, id]));

  const itens: ItemArvore[] = linhasSinteticas(arv.raizes, ctx).map((linha) => {
    const id = idPorCodigo.get(linha.codigo)!;
    const registro = porId.get(id)!;
    const no = arv.porId.get(id)!;
    return {
      id,
      parentId: registro.parentId,
      tipo: registro.tipo,
      codigo: linha.codigo,
      ordem: no.ordem,
      nivel: linha.nivel,
      descricao: registro.descricao,
      unidade: registro.unidade,
      quantidade: Number(registro.quantidade),
      custoUnitario: Number(registro.custoUnitario),
      custoUnitarioComBdi: linha.custoUnitarioComBdi ?? Number(registro.custoUnitario),
      bdiPercentual: registro.bdiPercentual === null ? null : Number(registro.bdiPercentual),
      bdiEfetivo: linha.bdiPercentual ?? bdiOrcamento,
      bloqueado: registro.bloqueado,
      totalSemBdi: linha.totalSemBdi,
      totalComBdi: linha.totalComBdi,
      composicaoId: registro.composicaoId,
      composicaoCodigo: registro.composicao?.codigo ?? null,
      insumoId: registro.insumoId,
      insumoCodigo: registro.insumo?.codigo ?? null,
      bancoNome: registro.basePrecoUsada ? `${registro.basePrecoUsada.nome} (${registro.basePrecoUsada.fonte})` : null,
      custoCalculadoEm: registro.custoCalculadoEm,
    };
  });

  const gerais = totaisGerais(arv.raizes, ctx);
  return {
    itens,
    totalSemBdi: gerais.semBdi,
    totalComBdi: gerais.comBdi,
    resumoGrupos: resumoPorGrupo(arv.raizes, ctx),
    erro: null,
  };
}

export type DadosPlanilha = {
  cabecalho: {
    titulo: string;
    obra: string;
    contratante: string;
    dataBase: Date;
    basePrecoNome: string | null;
    bdiPercentual: number;
  };
  linhas: LinhaPlanilha[];
  resumoGrupos: ResumoGrupo[];
  totalSemBdi: number;
  totalComBdi: number;
};

/**
 * Dados prontos para o export (XLSX e PDF consomem ESTE mesmo resultado — é o que impede os dois
 * formatos de divergirem em número).
 */
export async function dadosPlanilha(orcamentoId: string, tipo: "sintetica" | "analitica"): Promise<DadosPlanilha | null> {
  const orc = await prisma.custoOrcamento.findUnique({
    where: { id: orcamentoId },
    include: {
      projeto: { select: { codigo: true, nome: true } },
      contratante: { select: { nome: true } },
      basePreco: { select: { nome: true } },
    },
  });
  if (!orc) return null;

  const linhasBanco = await prisma.custoOrcamentoItem.findMany({
    where: { orcamentoId },
    include: {
      composicao: { select: { codigo: true } },
      insumo: { select: { codigo: true } },
      basePrecoUsada: { select: { nome: true, fonte: true } },
    },
  });
  const nos: NoOrcamento[] = linhasBanco.map((l) => ({
    id: l.id,
    parentId: l.parentId,
    tipo: l.tipo,
    ordem: l.ordem,
    quantidade: Number(l.quantidade),
    custoUnitario: Number(l.custoUnitario),
    bdiPercentual: l.bdiPercentual === null ? null : Number(l.bdiPercentual),
    bloqueado: l.bloqueado,
  }));

  const arv = montarArvore(nos);
  const bdiOrcamento = orc.bdiPercentual === null ? 0 : Number(orc.bdiPercentual);
  const cabecalho = {
    titulo: orc.titulo,
    obra: orc.projeto ? `${orc.projeto.codigo} — ${orc.projeto.nome}` : (orc.nomeAvulso ?? "—"),
    contratante: orc.contratante?.nome ?? orc.contratanteNome ?? "—",
    dataBase: orc.dataBase,
    basePrecoNome: orc.basePreco?.nome ?? null,
    bdiPercentual: bdiOrcamento,
  };

  if (!arv.ok) {
    return { cabecalho, linhas: [], resumoGrupos: [], totalSemBdi: 0, totalComBdi: 0 };
  }

  const ctx: ContextoPlanilha = {
    bdiOrcamento,
    totais: new Map(
      linhasBanco.map((l) => [l.id, { totalSemBdi: Number(l.totalSemBdi), totalComBdi: Number(l.totalComBdi) }]),
    ),
    codigos: calcularCodigosWbs(arv.raizes),
    meta: new Map(linhasBanco.map((l) => [l.id, { descricao: l.descricao, unidade: l.unidade }])),
    origem: new Map(
      linhasBanco.map((l) => [
        l.id,
        {
          codigoBanco: l.composicao?.codigo ?? l.insumo?.codigo ?? null,
          bancoNome: l.basePrecoUsada ? `${l.basePrecoUsada.nome} (${l.basePrecoUsada.fonte})` : null,
        },
      ]),
    ),
  };

  let linhas: LinhaPlanilha[];
  if (tipo === "analitica") {
    linhas = linhasAnaliticas(arv.raizes, await composicoesResolvidas(linhasBanco, orc.basePrecoId), ctx);
  } else {
    linhas = linhasSinteticas(arv.raizes, ctx);
  }

  const gerais = totaisGerais(arv.raizes, ctx);
  return {
    cabecalho,
    linhas,
    resumoGrupos: resumoPorGrupo(arv.raizes, ctx),
    totalSemBdi: gerais.semBdi,
    totalComBdi: gerais.comBdi,
  };
}

/** Itens de composição de cada serviço vinculado, com preço na base do orçamento. */
async function composicoesResolvidas(
  linhas: { id: string; composicaoId: string | null }[],
  basePrecoId: string | null,
): Promise<Map<string, ItemComposicaoResolvido[]>> {
  const mapa = new Map<string, ItemComposicaoResolvido[]>();
  const comComposicao = linhas.filter((l) => l.composicaoId);
  if (comComposicao.length === 0) return mapa;

  const composicaoIds = [...new Set(comComposicao.map((l) => l.composicaoId!))];
  const itens = await prisma.custoComposicaoItem.findMany({
    where: { composicaoId: { in: composicaoIds } },
    orderBy: { ordem: "asc" },
    include: {
      insumo: { select: { id: true, codigo: true, descricao: true, unidade: true } },
      composicaoAux: { select: { id: true, codigo: true, descricao: true, unidade: true } },
    },
  });

  const insumoIds = itens.filter((i) => i.insumoId).map((i) => i.insumoId!);
  const precos = basePrecoId
    ? await prisma.custoPreco.findMany({
        where: { baseId: basePrecoId, insumoId: { in: [...new Set(insumoIds)] } },
        select: { insumoId: true, valor: true },
      })
    : [];
  const precoPorInsumo = new Map(precos.map((p) => [p.insumoId, Number(p.valor)]));

  const porComposicao = new Map<string, ItemComposicaoResolvido[]>();
  for (const item of itens) {
    const ref = item.tipo === "insumo" ? item.insumo! : item.composicaoAux!;
    const lista = porComposicao.get(item.composicaoId) ?? [];
    lista.push({
      codigo: ref.codigo,
      descricao: ref.descricao,
      unidade: ref.unidade,
      coeficiente: Number(item.coeficiente),
      precoUnitario: item.tipo === "insumo" ? (precoPorInsumo.get(ref.id) ?? null) : null,
    });
    porComposicao.set(item.composicaoId, lista);
  }

  for (const linha of comComposicao) {
    const itensComp = porComposicao.get(linha.composicaoId!);
    if (itensComp) mapa.set(linha.id, itensComp);
  }
  return mapa;
}

/** Bases de preço disponíveis para o seletor do cabeçalho (exclui a estrutural). */
export async function basesDisponiveis() {
  return prisma.custoBasePreco.findMany({
    where: { uf: { not: "NACIONAL" }, ativo: true },
    orderBy: [{ fonte: "asc" }, { uf: "asc" }, { regime: "asc" }, { dataBase: "desc" }],
    select: { id: true, nome: true, uf: true, regime: true, dataBase: true },
  });
}
