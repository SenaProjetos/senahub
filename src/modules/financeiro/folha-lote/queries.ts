import "server-only";
import { prisma } from "@/lib/prisma";
import { parseListParams } from "@/lib/list-params";

type RawParams = Record<string, string | string[] | undefined>;

/**
 * Lotes mensais de folha de projetistas, com resumo dos pagamentos vinculados.
 *
 * As contagens por lote vêm de dois `groupBy` sobre os ids da página — nunca de
 * `include: { pagamentos: {...} } }` carregando toda linha filha só para contar
 * (mesmo erro do D11 do plano de refatoração, com outro nome: D12).
 */
export async function listarFolhasProjetista(sp: RawParams) {
  const { page, pageSize, skip, take } = parseListParams(sp, { sortFields: [] });

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

  const contagens = new Map<string, Record<string, number>>();
  for (const r of porStatus) {
    if (!r.folhaId) continue;
    const c = contagens.get(r.folhaId) ?? {};
    c[r.status] = r._count._all;
    contagens.set(r.folhaId, c);
  }
  const semValorMap = new Map(semValorPorFolha.flatMap((r) => (r.folhaId ? [[r.folhaId, r._count._all] as const] : [])));

  const folhas = fs.map((f) => {
    const c = contagens.get(f.id) ?? {};
    const qtd = Object.values(c).reduce((s, n) => s + n, 0);
    const pagos = c.pago ?? 0;
    const pendentes = c.pendente ?? 0;
    const semValor = semValorMap.get(f.id) ?? 0;
    return {
      id: f.id,
      ano: f.ano,
      mes: f.mes,
      status: f.status,
      total: Number(f.total),
      qtd,
      pagos,
      todosPagos: qtd > 0 && pagos === qtd,
      // Pendentes com R$ 0,00 — ficam de fora do "Pagar lote" (F0a).
      semValor,
      // Pendentes com valor, que o "Pagar lote" efetiva.
      pagaveis: pendentes - semValor,
    };
  });

  return { folhas, total, page, pageSize };
}

export type FolhaLoteItem = Awaited<ReturnType<typeof listarFolhasProjetista>>["folhas"][number];
