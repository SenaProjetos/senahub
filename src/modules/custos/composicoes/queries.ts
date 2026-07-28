import "server-only";
import { prisma } from "@/lib/prisma";
import { parseListParams } from "@/lib/list-params";
import { calcularCustoUnitario, type ItemComposicaoRef } from "./composicao";

type RawParams = Record<string, string | string[] | undefined>;

// ── Importações ──────────────────────────────────────────────────

export async function obterImportacao(id: string) {
  return prisma.custoImportacao.findUnique({ where: { id } });
}

export async function listarImportacoes() {
  return prisma.custoImportacao.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { autor: { select: { name: true } } },
  });
}

// ── Bases de preço ───────────────────────────────────────────────

export type BasePrecoItem = {
  id: string;
  nome: string;
  fonte: string;
  uf: string;
  regime: string;
  dataBase: Date;
  ativo: boolean;
};

/** Bases de PREÇO (exclui a base estrutural "NACIONAL" usada só para ancorar composições). */
export async function listarBasesPreco(): Promise<BasePrecoItem[]> {
  return prisma.custoBasePreco.findMany({
    where: { uf: { not: "NACIONAL" } },
    orderBy: [{ fonte: "asc" }, { uf: "asc" }, { regime: "asc" }, { dataBase: "desc" }],
  });
}

// ── Insumos ──────────────────────────────────────────────────────

export type InsumoListItem = {
  id: string;
  codigo: string;
  fonte: string;
  descricao: string;
  unidade: string;
  categoria: string;
};

const SORT_INSUMO = ["codigo", "descricao", "categoria"] as const;

export async function listarInsumos(sp: RawParams, filtros?: { categoria?: string }) {
  const { page, pageSize, skip, take, sort, dir, q } = parseListParams(sp, {
    sortFields: SORT_INSUMO,
    defaultSort: "codigo",
    defaultDir: "asc",
  });

  const where = {
    AND: [
      filtros?.categoria ? { categoria: filtros.categoria as never } : {},
      q
        ? {
            OR: [
              { codigo: { contains: q, mode: "insensitive" as const } },
              { descricao: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {},
    ],
  };

  const [itens, total] = await Promise.all([
    prisma.custoInsumo.findMany({
      where,
      orderBy: sort ? { [sort]: dir } : { codigo: "asc" },
      skip,
      take,
    }),
    prisma.custoInsumo.count({ where }),
  ]);

  return { itens: itens as InsumoListItem[], total, page, pageSize };
}

export type InsumoDetalhe = InsumoListItem & {
  precos: { baseId: string; baseNome: string; uf: string; regime: string; valor: number }[];
};

export async function obterInsumo(id: string): Promise<InsumoDetalhe | null> {
  const registro = await prisma.custoInsumo.findUnique({
    where: { id },
    include: { precos: { include: { base: true }, orderBy: [{ base: { uf: "asc" } }, { base: { regime: "asc" } }] } },
  });
  if (!registro) return null;
  return {
    id: registro.id,
    codigo: registro.codigo,
    fonte: registro.fonte,
    descricao: registro.descricao,
    unidade: registro.unidade,
    categoria: registro.categoria,
    precos: registro.precos.map((p) => ({
      baseId: p.baseId,
      baseNome: p.base.nome,
      uf: p.base.uf,
      regime: p.base.regime,
      valor: Number(p.valor),
    })),
  };
}

// ── Composições ──────────────────────────────────────────────────

export type ComposicaoListItem = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  grupo: string | null;
  fonte: string;
};

const SORT_COMPOSICAO = ["codigo", "descricao", "grupo"] as const;

export async function listarComposicoes(sp: RawParams) {
  const { page, pageSize, skip, take, sort, dir, q } = parseListParams(sp, {
    sortFields: SORT_COMPOSICAO,
    defaultSort: "codigo",
    defaultDir: "asc",
  });

  const where = q
    ? {
        OR: [
          { codigo: { contains: q, mode: "insensitive" as const } },
          { descricao: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [registros, total] = await Promise.all([
    prisma.custoComposicao.findMany({
      where,
      orderBy: sort ? { [sort]: dir } : { codigo: "asc" },
      skip,
      take,
      include: { base: { select: { fonte: true } } },
    }),
    prisma.custoComposicao.count({ where }),
  ]);

  const itens: ComposicaoListItem[] = registros.map((r) => ({
    id: r.id,
    codigo: r.codigo,
    descricao: r.descricao,
    unidade: r.unidade,
    grupo: r.grupo,
    fonte: r.base.fonte,
  }));
  return { itens, total, page, pageSize };
}

type NoSubgrafo = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  itens: {
    id: string;
    tipo: "insumo" | "composicao";
    coeficiente: number;
    insumo: { id: string; codigo: string; descricao: string; unidade: string } | null;
    composicaoAux: { id: string; codigo: string; descricao: string; unidade: string } | null;
  }[];
};

/** BFS pelo grafo de composição auxiliar (profundidade limitada por construção — o próprio motor rejeita ciclo). */
async function coletarSubgrafo(composicaoIdRaiz: string, limiteNos = 500): Promise<Map<string, NoSubgrafo>> {
  const porId = new Map<string, NoSubgrafo>();
  const fila = [composicaoIdRaiz];
  const visitados = new Set<string>();

  while (fila.length > 0 && porId.size < limiteNos) {
    const id = fila.shift()!;
    if (visitados.has(id)) continue;
    visitados.add(id);

    const comp = await prisma.custoComposicao.findUnique({
      where: { id },
      include: {
        itens: {
          orderBy: { ordem: "asc" },
          include: {
            insumo: { select: { id: true, codigo: true, descricao: true, unidade: true } },
            composicaoAux: { select: { id: true, codigo: true, descricao: true, unidade: true } },
          },
        },
      },
    });
    if (!comp) continue;
    porId.set(id, { ...comp, itens: comp.itens.map((item) => ({ ...item, coeficiente: Number(item.coeficiente) })) });
    for (const item of comp.itens) {
      if (item.tipo === "composicao" && item.composicaoAux) fila.push(item.composicaoAux.id);
    }
  }
  return porId;
}

export type ItemComposicaoDetalhe = {
  id: string;
  tipo: "insumo" | "composicao";
  coeficiente: number;
  refId: string;
  codigo: string;
  descricao: string;
  unidade: string;
};

export type ComposicaoDetalhe = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  grupo: string | null;
  fonte: string;
  itens: ItemComposicaoDetalhe[];
  custoUnitario: number | null;
  semPreco: string[];
  erroCalculo: string | null;
  baseUsadaId: string | null;
};

/**
 * Composição + itens (1 nível, para exibição) e custo unitário calculado a partir dos
 * coeficientes (recursivo pelos auxiliares) contra os preços de `basePrecoId`. Sem base
 * escolhida, devolve só a estrutura (sem custo).
 */
export async function obterComposicao(id: string, basePrecoId?: string): Promise<ComposicaoDetalhe | null> {
  const raiz = await prisma.custoComposicao.findUnique({ where: { id }, include: { base: { select: { fonte: true } } } });
  if (!raiz) return null;

  const subgrafo = await coletarSubgrafo(id);

  const resolverItens = (compId: string): ItemComposicaoRef[] | undefined => {
    const no = subgrafo.get(compId);
    if (!no) return undefined;
    return no.itens.map((item) => ({
      tipo: item.tipo,
      refId: item.tipo === "insumo" ? item.insumo!.id : item.composicaoAux!.id,
      coeficiente: Number(item.coeficiente),
    }));
  };

  let resolverPreco: (insumoId: string) => number | undefined = () => undefined;
  if (basePrecoId) {
    const insumoIds = new Set<string>();
    for (const no of subgrafo.values()) {
      for (const item of no.itens) if (item.tipo === "insumo" && item.insumo) insumoIds.add(item.insumo.id);
    }
    const precos = await prisma.custoPreco.findMany({
      where: { baseId: basePrecoId, insumoId: { in: [...insumoIds] } },
      select: { insumoId: true, valor: true },
    });
    const mapa = new Map(precos.map((p) => [p.insumoId, Number(p.valor)]));
    resolverPreco = (insumoId: string) => mapa.get(insumoId);
  }

  const resultado = basePrecoId ? calcularCustoUnitario(id, resolverItens, resolverPreco) : null;

  const noRaiz = subgrafo.get(id)!;
  const itens: ItemComposicaoDetalhe[] = noRaiz.itens.map((item) => {
    const ref = item.tipo === "insumo" ? item.insumo! : item.composicaoAux!;
    return {
      id: item.id,
      tipo: item.tipo,
      coeficiente: Number(item.coeficiente),
      refId: ref.id,
      codigo: ref.codigo,
      descricao: ref.descricao,
      unidade: ref.unidade,
    };
  });

  return {
    id: raiz.id,
    codigo: raiz.codigo,
    descricao: raiz.descricao,
    unidade: raiz.unidade,
    grupo: raiz.grupo,
    fonte: raiz.base.fonte,
    itens,
    custoUnitario: resultado?.ok ? resultado.custoUnitario : null,
    semPreco: resultado?.ok ? resultado.semPreco : [],
    erroCalculo: resultado && !resultado.ok ? resultado.erro : null,
    baseUsadaId: basePrecoId ?? null,
  };
}
