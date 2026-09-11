import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { parseListParams } from "@/lib/list-params";
import { paraData } from "@/lib/data";
import { lerFiltrosFolha, whereDoStatus } from "./service";
import type { FiltrosFolha, FiltroStatus } from "./status";

type RawParams = Record<string, string | string[] | undefined>;

const SORT_PAGAMENTO = ["projetista", "valor", "liberadoEm"] as const;

const INCLUDE_PAGAMENTO = {
  projetista: { select: { name: true } },
  disciplina: {
    select: { disciplinaTextoLegado: true, projetoId: true, projeto: { select: { codigo: true, nome: true } } },
  },
} satisfies Prisma.PagamentoProjetistaInclude;

type PagamentoBruto = Prisma.PagamentoProjetistaGetPayload<{ include: typeof INCLUDE_PAGAMENTO }>;

/**
 * Pendentes com R$ 0,00 — contado no banco, nunca com `.filter()` sobre uma lista já
 * paginada (ver D11 no plano de refatoração). Usado pelo aviso da F0a, que é da PÁGINA
 * (aparece nas duas abas de Produção), não só da lista de pagamentos. Ignora os filtros
 * de propósito: o aviso é sobre dinheiro travado em qualquer lugar da folha.
 */
export async function contarPendentesSemValor() {
  return prisma.pagamentoProjetista.count({ where: { status: "pendente", valor: { lte: 0 } } });
}

/** Todos os filtros MENOS o status — é a base dos totais (ver comentário em `listarFolha`). */
function whereSemStatus(f: FiltrosFolha): Prisma.PagamentoProjetistaWhereInput {
  const and: Prisma.PagamentoProjetistaWhereInput[] = [];
  if (f.projetistaId) and.push({ projetistaId: f.projetistaId });
  if (f.projetoId) and.push({ disciplina: { projetoId: f.projetoId } });

  // `liberadoEm` é um INSTANTE (`@default(now())`), não uma coluna `@db.Date` — então as
  // fronteiras do dia são meia-noite LOCAL, e `ate` é inclusivo (vira `< dia seguinte`).
  const de = paraData(f.de);
  const ate = paraData(f.ate);
  if (de || ate) {
    const depoisDoFim = ate ? new Date(ate.getFullYear(), ate.getMonth(), ate.getDate() + 1) : null;
    and.push({ liberadoEm: { ...(de ? { gte: de } : {}), ...(depoisDoFim ? { lt: depoisDoFim } : {}) } });
  }

  if (f.q) {
    const contem = { contains: f.q, mode: "insensitive" as const };
    and.push({
      OR: [
        { projetista: { name: contem } },
        { disciplina: { disciplinaTextoLegado: contem } },
        { disciplina: { projeto: { nome: contem } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

function ordenacao(sort: string | null, dir: "asc" | "desc"): Prisma.PagamentoProjetistaOrderByWithRelationInput[] {
  if (sort === "projetista") return [{ projetista: { name: dir } }, { liberadoEm: "desc" }];
  if (sort === "valor") return [{ valor: dir }, { liberadoEm: "desc" }];
  if (sort === "liberadoEm") return [{ liberadoEm: dir }];
  // Sem ordenação escolhida: a de sempre — pendentes primeiro, mais recentes primeiro.
  return [{ status: "asc" }, { liberadoEm: "desc" }];
}

/**
 * Totais por status sobre `base` (SEM o filtro de status) + quantos cancelados o padrão
 * esconde. Reusado pelos dois modos de leitura (por pagamento e por projetista) — os dois
 * mostram os MESMOS 3 cards de KPI, então a conta não pode divergir entre eles.
 */
async function resumoDoRecorte(base: Prisma.PagamentoProjetistaWhereInput, statusFiltro: FiltroStatus | null) {
  const porStatus = await prisma.pagamentoProjetista.groupBy({
    by: ["status"],
    where: base,
    _sum: { valor: true },
    _count: { _all: true },
  });
  const linha = (status: string) => porStatus.find((r) => r.status === status);
  const somaDe = (status: string) => Number(linha(status)?._sum.valor ?? 0);
  return {
    resumo: { pendente: somaDe("pendente"), pago: somaDe("pago"), cancelado: somaDe("cancelado") },
    canceladosOcultos: statusFiltro === null ? (linha("cancelado")?._count._all ?? 0) : 0,
  };
}

/**
 * Anexa o lançamento de cada pagamento (D24 — conta usada, previsto ou não) e serializa
 * Decimal → number. Não há FK entre as tabelas, só as colunas soltas
 * `PagamentoProjetista.lancamentoId` e `Lancamento.pagamentoProjetistaId`;
 * `confirmarDespesaProjetista` acha por qualquer uma das duas, então aqui também.
 */
async function comLancamentos<T extends PagamentoBruto>(itens: T[]) {
  const ids = itens.map((i) => i.id);
  const lancIds = itens.flatMap((i) => (i.lancamentoId ? [i.lancamentoId] : []));
  const lancamentos = ids.length
    ? await prisma.lancamento.findMany({
        where: { OR: [{ pagamentoProjetistaId: { in: ids } }, { id: { in: lancIds } }] },
        select: {
          id: true,
          status: true,
          pagamentoProjetistaId: true,
          dataConfirmacao: true,
          conta: { select: { nome: true } },
          forma: { select: { nome: true } },
        },
      })
    : [];
  const lancPorId = new Map(lancamentos.map((l) => [l.id, l]));
  const lancPorPagamento = new Map(
    lancamentos.flatMap((l) => (l.pagamentoProjetistaId ? [[l.pagamentoProjetistaId, l] as const] : [])),
  );

  return itens.map((i) => {
    const l = (i.lancamentoId ? lancPorId.get(i.lancamentoId) : undefined) ?? lancPorPagamento.get(i.id);
    return {
      ...i,
      // Serializa Decimal → number (Client Components não aceitam Decimal).
      valor: Number(i.valor),
      lancamento: l
        ? {
            id: l.id,
            status: l.status as string,
            conta: l.conta?.nome ?? null,
            forma: l.forma?.nome ?? null,
            dataConfirmacao: l.dataConfirmacao,
          }
        : null,
    };
  });
}

/** Modo "por pagamento" (F2): tabela plana, paginada, com filtro/ordenação na URL. */
export async function listarFolha(sp: RawParams) {
  const filtros = lerFiltrosFolha(sp);
  const { page, pageSize, skip, take, sort, dir } = parseListParams(sp, { sortFields: SORT_PAGAMENTO });

  // DOIS `where`, de propósito — não unificar: a TABELA respeita o filtro de status; os
  // TOTAIS não. Eles são o desdobramento por status do recorte filtrado: se herdassem o
  // padrão "esconde cancelados", o card "Cancelado" ficaria sempre zerado e não haveria de
  // onde tirar o "N cancelados ocultos". A tela diz isso em texto, embaixo dos cards.
  const base = whereSemStatus(filtros);
  const where: Prisma.PagamentoProjetistaWhereInput = { AND: [base, whereDoStatus(filtros.status)] };

  const [itensBrutos, total, agregado] = await Promise.all([
    prisma.pagamentoProjetista.findMany({ where, orderBy: ordenacao(sort, dir), skip, take, include: INCLUDE_PAGAMENTO }),
    prisma.pagamentoProjetista.count({ where }),
    // Somado no banco sobre TODO o recorte, nunca com `.reduce()` sobre a página (D11).
    resumoDoRecorte(base, filtros.status),
  ]);
  const itens = await comLancamentos(itensBrutos);

  return { itens, total, page, pageSize, ...agregado, filtros };
}

export type FolhaItem = Awaited<ReturnType<typeof listarFolha>>["itens"][number];

/**
 * Modo "por projetista" (F3, N1): mesmo recorte de `listarFolha`, agrupado por pessoa —
 * sem paginação (o volume de Produção é pequeno o bastante para caber inteiro agrupado,
 * ver §1 do plano; reavaliar se passar da casa dos milhares).
 *
 * `qtd` respeita o filtro de status (é o que a lista expandida mostra); `totalPendente`
 * NÃO respeita — mesma regra dos cards de KPI: "quanto essa pessoa tem a receber" não
 * deveria sumir só porque a aba está filtrada em "pago".
 */
export async function listarFolhaAgrupada(sp: RawParams) {
  const filtros = lerFiltrosFolha(sp);
  const base = whereSemStatus(filtros);
  const where: Prisma.PagamentoProjetistaWhereInput = { AND: [base, whereDoStatus(filtros.status)] };

  const [itensBrutos, agregado, pendentePorProjetista] = await Promise.all([
    prisma.pagamentoProjetista.findMany({
      where,
      orderBy: [{ projetista: { name: "asc" } }, { status: "asc" }, { liberadoEm: "desc" }],
      include: INCLUDE_PAGAMENTO,
    }),
    resumoDoRecorte(base, filtros.status),
    prisma.pagamentoProjetista.groupBy({
      by: ["projetistaId"],
      where: { AND: [base, { status: "pendente" }] },
      _sum: { valor: true },
    }),
  ]);
  const itens = await comLancamentos(itensBrutos);
  const pendentePorId = new Map(pendentePorProjetista.map((r) => [r.projetistaId, Number(r._sum.valor ?? 0)]));

  // Agrupamento em JS é só estrutura de exibição — a soma exibida (`totalPendente`) vem do
  // `groupBy` acima, nunca de somar `itens` na mão (mesma armadilha do D11).
  const porId = new Map<string, { projetistaId: string; projetistaNome: string; itens: (typeof itens)[number][] }>();
  for (const it of itens) {
    const g = porId.get(it.projetistaId) ?? { projetistaId: it.projetistaId, projetistaNome: it.projetista.name, itens: [] };
    g.itens.push(it);
    porId.set(it.projetistaId, g);
  }
  const grupos = [...porId.values()].map((g) => ({
    ...g,
    qtd: g.itens.length,
    totalPendente: pendentePorId.get(g.projetistaId) ?? 0,
  }));

  return { grupos, ...agregado, filtros };
}

export type FolhaGrupo = Awaited<ReturnType<typeof listarFolhaAgrupada>>["grupos"][number];

/** Opções dos filtros: só quem/o que tem pagamento — não a empresa inteira. */
export async function opcoesFiltroFolha() {
  const [projetistas, projetos] = await Promise.all([
    prisma.user.findMany({
      where: { pagamentos: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.projeto.findMany({
      where: { disciplinas: { some: { pagamentos: { some: {} } } } },
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, codigo: true, nome: true },
    }),
  ]);
  return { projetistas, projetos };
}
