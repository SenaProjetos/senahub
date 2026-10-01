import "server-only";
import { prisma } from "@/lib/prisma";
import { TAG_REEMBOLSO } from "@/modules/financeiro/distribuicao/calculo";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";
import type { Centavos, DataIso } from "@/modules/financeiro/liquidez/tipos";

export type RegraDto = {
  id: string;
  nome: string;
  ativa: boolean;
  padrao: boolean;
  categoriasIds: string[];
  categoriasNomes: string[];
  /** Na ordem da regra. */
  itens: { caixinhaId: string | null; caixinhaNome: string | null; bp: number }[];
  /** Quantas vezes foi usada numa distribuição (decide se dá para excluir). */
  usos: number;
};

/** Regras na ordem de criação (a mais antiga vence quando duas citam a mesma categoria). */
export async function carregarRegras(): Promise<RegraDto[]> {
  const regras = await prisma.regraDistribuicao.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      itens: { orderBy: { ordem: "asc" }, include: { caixinha: { select: { nome: true } } } },
      _count: { select: { distribuicoes: true } },
    },
  });
  const ids = [...new Set(regras.flatMap((r) => r.categoriasIds))];
  const cats = ids.length ? await prisma.categoriaFinanceira.findMany({ where: { id: { in: ids } }, select: { id: true, codigo: true, nome: true } }) : [];
  const nomeDe = new Map(cats.map((c) => [c.id, `${c.codigo} ${c.nome}`]));
  return regras.map((r) => ({
    id: r.id,
    nome: r.nome,
    ativa: r.ativa,
    padrao: r.padrao,
    categoriasIds: r.categoriasIds,
    categoriasNomes: r.categoriasIds.map((id) => nomeDe.get(id) ?? "Categoria removida"),
    itens: r.itens.map((i) => ({ caixinhaId: i.caixinhaId, caixinhaNome: i.caixinha?.nome ?? null, bp: i.bp })),
    usos: r._count.distribuicoes,
  }));
}

export type RecebimentoDto = {
  id: string;
  descricao: string;
  /** Quem pagou (cliente) e onde caiu (conta), para a pessoa reconhecer o recebimento. */
  cliente: string | null;
  conta: string | null;
  dataConfirmacao: DataIso;
  /** Centavos: o valor EFETIVAMENTE recebido. */
  valor: Centavos;
  categoriaId: string;
  categoriaNome: string;
};

/**
 * Receitas realizadas que ainda não passaram por "Recebimentos a distribuir" (spec I9): do resultado
 * (transferência não é receita), sem reembolso de ART, recebidas desde `distribuirDesde`. Os mais
 * recentes primeiro; 50 bastam — quem acumula mais que isso deve avançar a data inicial.
 */
export async function recebimentosADistribuir(desde: DataIso | null): Promise<RecebimentoDto[]> {
  if (!desde) return [];
  const rows = await prisma.lancamento.findMany({
    where: {
      tipo: "receita",
      status: "confirmado",
      excluidoEm: null,
      dataConfirmacao: { gte: new Date(`${desde}T00:00:00.000Z`) },
      distribuicao: null,
      categoria: { natureza: "resultado" },
      NOT: { tags: { has: TAG_REEMBOLSO } },
    },
    orderBy: [{ dataConfirmacao: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      descricao: true,
      valor: true,
      valorEfetivo: true,
      dataConfirmacao: true,
      categoriaId: true,
      categoria: { select: { nome: true } },
      cliente: { select: { nome: true } },
      conta: { select: { nome: true } },
    },
  });
  return rows.flatMap((l) =>
    l.dataConfirmacao
      ? [
          {
            id: l.id,
            descricao: l.descricao,
            cliente: l.cliente?.nome ?? null,
            conta: l.conta?.nome ?? null,
            dataConfirmacao: isoDeDataDoBanco(l.dataConfirmacao),
            valor: paraCentavos(l.valorEfetivo ?? l.valor),
            categoriaId: l.categoriaId,
            categoriaNome: l.categoria.nome,
          },
        ]
      : [],
  );
}

/** Categorias de receita ativas que uma regra pode citar. */
export async function categoriasDeReceita(): Promise<{ id: string; codigo: string; nome: string }[]> {
  return prisma.categoriaFinanceira.findMany({
    where: { ativo: true, tipo: "receita", natureza: "resultado" },
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, nome: true },
  });
}
