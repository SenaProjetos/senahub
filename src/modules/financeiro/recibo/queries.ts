import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { parseListParams } from "@/lib/list-params";

type RawParams = Record<string, string | string[] | undefined>;

/**
 * Leituras do recibo de produção (G5/D36). Decimal vira `number` aqui — Client Component não
 * aceita Decimal, mesma regra de `folha/queries.ts`.
 */

const INCLUDE = {
  assinante: { select: { name: true } },
  itens: {
    include: {
      pagamento: {
        select: {
          id: true,
          valor: true,
          liberadoEm: true,
          pagoEm: true,
          disciplina: {
            select: { disciplinaTextoLegado: true, projeto: { select: { codigo: true, nome: true } } },
          },
        },
      },
    },
  },
  // NF do PJ referente ao recibo (pedido do dono, 2026-09-12). O arquivo em si fica no
  // storage; aqui só o que a tela mostra.
  notas: {
    select: { id: true, numero: true, valor: true, status: true, arquivoNome: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  },
} as const;

type ReciboBruto = Prisma.ReciboProjetistaGetPayload<{ include: typeof INCLUDE }>;

/**
 * Decimal → number. Escrito campo a campo de propósito: com um genérico e spread, o tipo de
 * saída virava a interseção do original com o novo e o `valor` continuava `Decimal` para o
 * TypeScript — erro que só aparece no componente, longe daqui.
 */
function serializar(r: ReciboBruto) {
  return {
    id: r.id,
    tipo: r.tipo as string,
    projetistaId: r.projetistaId,
    ano: r.ano,
    mes: r.mes,
    texto: r.texto,
    textoHash: r.textoHash,
    criadoEm: r.criadoEm,
    assinadoEm: r.assinadoEm,
    assinante: r.assinante,
    valor: Number(r.valor),
    itens: r.itens.map((i) => ({
      id: i.id,
      pagamento: {
        id: i.pagamento.id,
        valor: Number(i.pagamento.valor),
        liberadoEm: i.pagamento.liberadoEm,
        pagoEm: i.pagamento.pagoEm,
        disciplina: i.pagamento.disciplina,
      },
    })),
    notas: r.notas.map((n) => ({
      id: n.id,
      numero: n.numero,
      valor: Number(n.valor),
      status: n.status as string,
      arquivoNome: n.arquivoNome,
      createdAt: n.createdAt,
    })),
  };
}

/** Recibos do próprio projetista (tela do extrato). */
export async function recibosDoProjetista(userId: string) {
  const rows = await prisma.reciboProjetista.findMany({
    where: { projetistaId: userId },
    orderBy: { criadoEm: "desc" },
    include: INCLUDE,
  });
  return rows.map(serializar);
}

export type ReciboItem = Awaited<ReturnType<typeof recibosDoProjetista>>[number];

/** Um recibo, com titular — usado pelo PDF e pela conferência de titularidade. */
export async function reciboCompleto(id: string) {
  const r = await prisma.reciboProjetista.findUnique({
    where: { id },
    include: { ...INCLUDE, projetista: { select: { id: true, name: true } } },
  });
  return r && { ...serializar(r), projetista: r.projetista };
}

/**
 * Quais pagamentos já entraram em algum recibo — a tela de Produção mostra isso na linha
 * paga para não gerar recibo duplicado sem perceber.
 */
export async function recibosPorPagamento(pagamentoIds: string[]) {
  if (pagamentoIds.length === 0) return new Map<string, { id: string; tipo: string; assinadoEm: Date | null }[]>();
  const itens = await prisma.reciboProjetistaItem.findMany({
    where: { pagamentoId: { in: pagamentoIds } },
    select: { pagamentoId: true, recibo: { select: { id: true, tipo: true, assinadoEm: true } } },
  });
  const mapa = new Map<string, { id: string; tipo: string; assinadoEm: Date | null }[]>();
  for (const i of itens) {
    const lista = mapa.get(i.pagamentoId) ?? [];
    lista.push(i.recibo);
    mapa.set(i.pagamentoId, lista);
  }
  return mapa;
}

const SORT_RECIBO = ["criadoEm"] as const;

export type FiltroStatusRecibo = "todos" | "assinado" | "pendente";

function whereRecibo(projetistaId: string, status: FiltroStatusRecibo): Prisma.ReciboProjetistaWhereInput {
  const and: Prisma.ReciboProjetistaWhereInput[] = [];
  if (projetistaId) and.push({ projetistaId });
  if (status === "assinado") and.push({ assinadoEm: { not: null } });
  if (status === "pendente") and.push({ assinadoEm: null });
  return and.length ? { AND: and } : {};
}

/**
 * Todo recibo gerado, de qualquer projetista — acompanhamento de quem gerencia Produção
 * (o próprio projetista só vê os seus, em `recibosDoProjetista`). Até aqui, gerar um recibo
 * era "atirar e esquecer": nenhuma tela mostrava se foi assinado ou continua parado.
 */
export async function listarRecibos(sp: RawParams) {
  const { page, pageSize, skip, take } = parseListParams(sp, { sortFields: SORT_RECIBO });
  // Nomes de param DIFERENTES dos da aba Pagamentos (`status`/`projetistaId`) de propósito —
  // as duas abas leem a MESMA URL; reusar o mesmo nome faria um filtro escolhido aqui
  // vazar pra Pagamentos ao trocar de aba, sem o usuário ter pedido isso lá (mesmo cuidado
  // do `loteId`/`folhaId` da G11, que também são só desta tela).
  const projetistaId = typeof sp.reciboProjetistaId === "string" ? sp.reciboProjetistaId : "";
  const statusRaw = typeof sp.reciboStatus === "string" ? sp.reciboStatus : "";
  const status: FiltroStatusRecibo = statusRaw === "assinado" || statusRaw === "pendente" ? statusRaw : "todos";
  const where = whereRecibo(projetistaId, status);

  const [rows, total, pendentes] = await Promise.all([
    prisma.reciboProjetista.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      skip,
      take,
      select: {
        id: true,
        tipo: true,
        ano: true,
        mes: true,
        valor: true,
        criadoEm: true,
        assinadoEm: true,
        projetista: { select: { id: true, name: true } },
        assinante: { select: { name: true } },
        _count: { select: { itens: true } },
      },
    }),
    prisma.reciboProjetista.count({ where }),
    // Ignora o filtro de status de propósito — é o resumo de "quanto falta", igual aos
    // cards da aba Pagamentos que somam o recorte sem herdar o filtro de status dela.
    prisma.reciboProjetista.count({ where: whereRecibo(projetistaId, "pendente") }),
  ]);

  const recibos = rows.map((r) => ({
    id: r.id,
    tipo: r.tipo as string,
    ano: r.ano,
    mes: r.mes,
    valor: Number(r.valor),
    criadoEm: r.criadoEm,
    assinadoEm: r.assinadoEm,
    projetista: r.projetista,
    assinanteNome: r.assinante?.name ?? null,
    qtdEntregas: r._count.itens,
  }));

  // "todos" só existe pro `where` — o componente usa o sentinela "" (mesma convenção do
  // resto da tela: `Boolean(filtros.status)` e `filtros.status || TODOS` só funcionam se o
  // default aqui NÃO for uma string truthy).
  return {
    recibos,
    total,
    page,
    pageSize,
    pendentes,
    filtros: { projetistaId, status: status === "todos" ? "" : status },
  };
}

export type RecibosItem = Awaited<ReturnType<typeof listarRecibos>>["recibos"][number];

/** Opções do filtro de projetista — só quem já tem recibo gerado. */
export async function opcoesFiltroRecibos() {
  const projetistas = await prisma.user.findMany({
    where: { recibosProjetista: { some: {} } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return { projetistas };
}
