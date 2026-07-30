import "server-only";
import { prisma } from "@/lib/prisma";
import { parseListParams } from "@/lib/list-params";
import { compararPropostas } from "./comparador";

type RawParams = Record<string, string | string[] | undefined>;

export type RfqListItem = {
  id: string;
  titulo: string;
  status: string;
  prazoResposta: Date | null;
  orcamentoTitulo: string | null;
  totalItens: number;
  totalPropostas: number;
  criadoPorNome: string;
  createdAt: Date;
};

const SORT_RFQ = ["titulo", "status", "prazoResposta", "createdAt"] as const;

export async function listarRfqs(sp: RawParams, filtros?: { status?: string }) {
  const { page, pageSize, skip, take, sort, dir, q } = parseListParams(sp, {
    sortFields: SORT_RFQ,
    defaultSort: "createdAt",
    defaultDir: "desc",
  });

  const where = {
    AND: [
      filtros?.status ? { status: filtros.status as never } : {},
      q ? { titulo: { contains: q, mode: "insensitive" as const } } : {},
    ],
  };

  const [linhas, total] = await Promise.all([
    prisma.custoRfq.findMany({
      where,
      orderBy: sort ? { [sort]: dir } : { createdAt: "desc" },
      skip,
      take,
      include: {
        orcamento: { select: { titulo: true } },
        criadoPor: { select: { name: true } },
        _count: { select: { itens: true, propostas: true } },
      },
    }),
    prisma.custoRfq.count({ where }),
  ]);

  const itens: RfqListItem[] = linhas.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    status: r.status,
    prazoResposta: r.prazoResposta,
    orcamentoTitulo: r.orcamento?.titulo ?? null,
    totalItens: r._count.itens,
    totalPropostas: r._count.propostas,
    criadoPorNome: r.criadoPor.name,
    createdAt: r.createdAt,
  }));

  return { itens, total, page, pageSize };
}

export type DetalheRfq = Awaited<ReturnType<typeof detalheRfq>>;

export async function detalheRfq(id: string) {
  const rfq = await prisma.custoRfq.findUnique({
    where: { id },
    include: {
      orcamento: { select: { id: true, titulo: true } },
      criadoPor: { select: { name: true } },
      itens: { orderBy: { descricao: "asc" } },
      convites: {
        include: { fornecedor: { select: { id: true, nome: true, avaliacaoNota: true } } },
        orderBy: { convidadoEm: "asc" },
      },
      propostas: {
        include: {
          fornecedor: { select: { id: true, nome: true, avaliacaoNota: true } },
          itens: true,
          anexos: true,
          criadoPor: { select: { name: true } },
          escolhidoPor: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!rfq) return null;

  // Mantém TODAS as propostas na comparação, mesmo depois da decisão — o ranking é o que justifica
  // a escolha (`justificativaEscolha`); escondê-lo assim que alguém vence tornaria a decisão
  // irrevisável. Os badges de status (recebida/vencedora/não escolhida) já distinguem visualmente.
  const rfqItemIds = rfq.itens.map((i) => i.id);
  const entradas = rfq.propostas
    .map((p) => ({
      propostaId: p.id,
      fornecedorNome: p.fornecedor.nome,
      itens: p.itens.map((i) => ({ rfqItemId: i.rfqItemId, precoUnitario: Number(i.precoUnitario), quantidadeItem: 0 })),
      frete: Number(p.frete ?? 0),
      impostosInclusos: p.impostosInclusos,
      impostosValor: p.impostosValor === null ? null : Number(p.impostosValor),
      prazoEntregaDias: p.prazoEntregaDias,
      validadeAte: p.validadeAte,
      avaliacaoFornecedor: p.fornecedor.avaliacaoNota === null ? null : Number(p.fornecedor.avaliacaoNota),
    }));

  const quantidadePorItem = new Map(rfq.itens.map((i) => [i.id, Number(i.quantidade)]));
  for (const entrada of entradas) {
    for (const item of entrada.itens) item.quantidadeItem = quantidadePorItem.get(item.rfqItemId) ?? 0;
  }

  // compararPropostas já ORDENA por totalComparavel — não remapear por cima de rfq.propostas
  // (createdAt asc), senão o ranking do comparador se perde em silêncio.
  const statusPorPropostaId = new Map(rfq.propostas.map((p) => [p.id, p.status]));
  const comparacao = compararPropostas(entradas, rfqItemIds).map((c) => ({
    ...c,
    status: statusPorPropostaId.get(c.propostaId) ?? "recebida",
  }));

  return { ...rfq, comparacao };
}

export type HistoricoPrecoItem = {
  id: string;
  descricao: string;
  fornecedorNome: string | null;
  valor: number;
  unidade: string;
  data: Date;
};

export async function historicoPrecoInsumo(insumoId: string): Promise<HistoricoPrecoItem[]> {
  const linhas = await prisma.custoPrecoHistorico.findMany({
    where: { insumoId },
    include: { fornecedor: { select: { nome: true } } },
    orderBy: { data: "desc" },
    take: 50,
  });
  return linhas.map((l) => ({
    id: l.id,
    descricao: l.descricao,
    fornecedorNome: l.fornecedor?.nome ?? null,
    valor: Number(l.valor),
    unidade: l.unidade,
    data: l.data,
  }));
}

export async function historicoPrecoFornecedor(fornecedorId: string): Promise<HistoricoPrecoItem[]> {
  const linhas = await prisma.custoPrecoHistorico.findMany({
    where: { fornecedorId },
    include: { fornecedor: { select: { nome: true } } },
    orderBy: { data: "desc" },
    take: 50,
  });
  return linhas.map((l) => ({
    id: l.id,
    descricao: l.descricao,
    fornecedorNome: l.fornecedor?.nome ?? null,
    valor: Number(l.valor),
    unidade: l.unidade,
    data: l.data,
  }));
}

export type FornecedorParaConvite = {
  id: string;
  nome: string;
  categoriasFornecidas: string[];
  avaliacaoNota: number | null;
  jaConvidado: boolean;
};

/** Fornecedores ativos pro seletor de convite — marca quem já foi convidado nesta RFQ. */
export async function buscarFornecedoresParaConvite(rfqId: string, q?: string): Promise<FornecedorParaConvite[]> {
  const [fornecedores, convidados] = await Promise.all([
    prisma.custoFornecedor.findMany({
      where: {
        ativo: true,
        ...(q ? { nome: { contains: q, mode: "insensitive" as const } } : {}),
      },
      select: { id: true, nome: true, categoriasFornecidas: true, avaliacaoNota: true },
      orderBy: { nome: "asc" },
      take: 50,
    }),
    prisma.custoRfqConvite.findMany({ where: { rfqId }, select: { fornecedorId: true } }),
  ]);
  const jaConvidados = new Set(convidados.map((c) => c.fornecedorId));
  return fornecedores.map((f) => ({
    id: f.id,
    nome: f.nome,
    categoriasFornecidas: f.categoriasFornecidas,
    avaliacaoNota: f.avaliacaoNota === null ? null : Number(f.avaliacaoNota),
    jaConvidado: jaConvidados.has(f.id),
  }));
}
