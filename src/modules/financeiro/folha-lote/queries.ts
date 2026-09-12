import "server-only";
import { prisma } from "@/lib/prisma";
import { parseListParams } from "@/lib/list-params";
import { INCLUDE_PAGAMENTO, comLancamentos } from "@/modules/financeiro/folha/queries";
import { resumirLotes, RESUMO_LOTE_VAZIO } from "./service";

type RawParams = Record<string, string | string[] | undefined>;

/**
 * Lotes mensais de folha de projetistas, com resumo dos pagamentos vinculados.
 *
 * As contagens por lote vêm de dois `groupBy` sobre os ids da página — nunca de
 * `include: { pagamentos: {...} } }` carregando toda linha filha só para contar
 * (mesmo erro do D11 do plano de refatoração, com outro nome: D12).
 */
export async function listarFolhasProjetista(sp: RawParams) {
  const parsed = parseListParams(sp, { sortFields: [] });
  const { pageSize } = parsed;
  let { page, skip, take } = parsed;

  // D34: veio do link "lote X/Y" da aba Pagamentos, sem `?page=` explícito — acha em que
  // página esse lote cai na ordenação (ano desc, mes desc) pra abrir já na página certa, em
  // vez de simplesmente não achar o lote se ele não estiver na primeira. Se o usuário já
  // pediu uma página específica, ela manda — isso evita que paginar manualmente com um
  // `loteId` velho ainda na URL puxe de volta pra página do lote a cada clique.
  const loteAlvo = typeof sp.loteId === "string" ? sp.loteId : Array.isArray(sp.loteId) ? sp.loteId[0] : undefined;
  if (loteAlvo && !sp.page) {
    const alvo = await prisma.folhaProjetista.findUnique({ where: { id: loteAlvo }, select: { ano: true, mes: true } });
    if (alvo) {
      const antes = await prisma.folhaProjetista.count({
        where: { OR: [{ ano: { gt: alvo.ano } }, { AND: [{ ano: alvo.ano }, { mes: { gt: alvo.mes } }] }] },
      });
      page = Math.floor(antes / pageSize) + 1;
      skip = (page - 1) * pageSize;
      take = pageSize;
    }
  }

  const [fs, total] = await Promise.all([
    prisma.folhaProjetista.findMany({
      orderBy: [{ ano: "desc" }, { mes: "desc" }],
      skip,
      take,
    }),
    prisma.folhaProjetista.count(),
  ]);

  const ids = fs.map((f) => f.id);
  if (ids.length === 0) return { folhas: [], total, page, pageSize };

  const [porStatus, semValorPorFolha] = await Promise.all([
    prisma.pagamentoProjetista.groupBy({
      by: ["folhaId", "status"],
      where: { folhaId: { in: ids } },
      _count: { _all: true },
    }),
    // Pendentes com R$ 0,00 — a action de pagar lote deixa essas linhas de fora (F0a).
    prisma.pagamentoProjetista.groupBy({
      by: ["folhaId"],
      where: { folhaId: { in: ids }, status: "pendente", valor: { lte: 0 } },
      _count: { _all: true },
    }),
  ]);

  const resumo = resumirLotes(porStatus, semValorPorFolha);
  const folhas = fs.map((f) => ({
    id: f.id,
    ano: f.ano,
    mes: f.mes,
    status: f.status,
    total: Number(f.total),
    ...(resumo.get(f.id) ?? RESUMO_LOTE_VAZIO),
  }));

  return { folhas, total, page, pageSize };
}

export type FolhaLoteItem = Awaited<ReturnType<typeof listarFolhasProjetista>>["folhas"][number];

/**
 * Pagamentos de um lote — pra expandir a linha na aba Lotes e responder "o que tem dentro
 * desse lote" (F10/D29), sem abrir mão da rastreabilidade da F2 (D24): reusa o MESMO
 * `INCLUDE_PAGAMENTO`/`comLancamentos` de `listarFolha`, não uma versão mais pobre só
 * porque é dentro de um lote. Carregado sob demanda por lote (ver `pagamentosDoLote` em
 * `actions.ts`), não junto com a lista de lotes — mesmo motivo do D12: carregar toda linha
 * filha só pra montar a lista já foi o erro daqui uma vez.
 */
export async function listarPagamentosDoLote(folhaId: string) {
  const itensBrutos = await prisma.pagamentoProjetista.findMany({
    where: { folhaId },
    orderBy: [{ status: "asc" }, { liberadoEm: "desc" }],
    include: INCLUDE_PAGAMENTO,
  });
  return comLancamentos(itensBrutos);
}

export type PagamentoDoLote = Awaited<ReturnType<typeof listarPagamentosDoLote>>[number];
