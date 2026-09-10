import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { parseListParams } from "@/lib/list-params";

type RawParams = Record<string, string | string[] | undefined>;

const SORT_PAGAMENTO = ["liberadoEm", "valor"] as const;
const STATUS_PAGAMENTO = ["pendente", "pago", "cancelado"] as const;
type StatusPagamentoFiltro = (typeof STATUS_PAGAMENTO)[number];

function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Pendentes com R$ 0,00 — contado no banco, nunca com `.filter()` sobre uma lista já
 * paginada (ver D11 no plano de refatoração). Usado pelo aviso da F0a, que é da PÁGINA
 * (aparece nas duas abas de Produção), não só da lista de pagamentos.
 */
export async function contarPendentesSemValor() {
  return prisma.pagamentoProjetista.count({ where: { status: "pendente", valor: { lte: 0 } } });
}

export async function listarFolha(sp: RawParams) {
  const { page, pageSize, skip, take, sort, dir } = parseListParams(sp, { sortFields: SORT_PAGAMENTO });

  // `?status=` já era aceito pela query e nunca lido de lugar nenhum (D13) — o Select
  // de filtro é da F2, mas o parâmetro passa a valer assim que alguém digitar a URL.
  const statusRaw = primeiro(sp.status);
  const status = (STATUS_PAGAMENTO as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as StatusPagamentoFiltro)
    : undefined;

  const where: Prisma.PagamentoProjetistaWhereInput = {};
  if (status) where.status = status;

  const [itens, total, porStatus] = await Promise.all([
    prisma.pagamentoProjetista.findMany({
      where,
      // Sem coluna clicável ainda (chega na F2) — `sort` só existe se vier na URL;
      // sem ele, mantém a ordem de sempre (pendentes primeiro, mais recentes primeiro).
      orderBy: sort ? { [sort]: dir } : [{ status: "asc" }, { liberadoEm: "desc" }],
      skip,
      take,
      include: {
        projetista: { select: { name: true } },
        disciplina: { select: { disciplinaTextoLegado: true, projeto: { select: { codigo: true, nome: true } } } },
      },
    }),
    prisma.pagamentoProjetista.count({ where }),
    // Somado no banco sobre TODO o recorte (`where`), nunca com `.reduce()` sobre a
    // página — senão os KPIs passam a mostrar só o total da página visível (D11).
    prisma.pagamentoProjetista.groupBy({ by: ["status"], where, _sum: { valor: true } }),
  ]);

  const somaDe = (status: string) => Number(porStatus.find((r) => r.status === status)?._sum.valor ?? 0);

  return {
    // Serializa Decimal → number (Client Components não aceitam Decimal).
    itens: itens.map((i) => ({ ...i, valor: Number(i.valor) })),
    total,
    page,
    pageSize,
    resumo: { pendente: somaDe("pendente"), pago: somaDe("pago"), cancelado: somaDe("cancelado") },
  };
}

export type FolhaItem = Awaited<ReturnType<typeof listarFolha>>["itens"][number];
