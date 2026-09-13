import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

type PagamentoExtratoBruto = Prisma.PagamentoProjetistaGetPayload<{
  include: {
    disciplina: {
      select: { disciplinaTextoLegado: true; projeto: { select: { codigo: true; nome: true } } };
    };
  };
}>;

/**
 * Forma de pagamento + comprovantes de cada pagamento, pelo mesmo truque de duas colunas
 * soltas (`lancamentoId`/`Lancamento.pagamentoProjetistaId`) que `folha/queries.ts` usa —
 * não há FK entre as tabelas. D35, de propósito, NÃO traz a conta: o projetista vê de que
 * FORMA foi pago (pix/ted/etc), não de qual conta bancária da empresa saiu.
 */
async function comFormaEComprovantes(itens: PagamentoExtratoBruto[]) {
  const ids = itens.map((i) => i.id);
  const lancIds = itens.flatMap((i) => (i.lancamentoId ? [i.lancamentoId] : []));
  const lancamentos = ids.length
    ? await prisma.lancamento.findMany({
        where: { OR: [{ pagamentoProjetistaId: { in: ids } }, { id: { in: lancIds } }] },
        select: {
          id: true,
          pagamentoProjetistaId: true,
          forma: { select: { nome: true } },
          anexos: { select: { id: true, nome: true }, orderBy: { createdAt: "desc" } },
        },
      })
    : [];
  const lancPorId = new Map(lancamentos.map((l) => [l.id, l]));
  const lancPorPagamento = new Map(
    lancamentos.flatMap((l) => (l.pagamentoProjetistaId ? [[l.pagamentoProjetistaId, l] as const] : [])),
  );

  return itens.map((i) => {
    // Prioriza o lado AUTORITATIVO (`Lancamento.pagamentoProjetistaId`, `@unique`) — é o
    // mesmo que a rota de download usa pra autorizar. A coluna solta (`lancamentoId`, sem
    // unique) só entra como reforço quando o autoritativo não achou nada, e só se o
    // lançamento resolvido não estiver "reivindicado" por OUTRO pagamento pelo lado
    // autoritativo: sem essa guarda, dois pagamentos com o mesmo `lancamentoId` (anomalia de
    // dado, não deveria acontecer, mas nada garante) fariam um projetista ver na lista o
    // anexo do outro — mesmo que o download em si já recuse (a rota nunca olha esta coluna).
    const porAutoritativo = lancPorPagamento.get(i.id);
    const porSolta = i.lancamentoId ? lancPorId.get(i.lancamentoId) : undefined;
    const soltaConfiavel = porSolta && (!porSolta.pagamentoProjetistaId || porSolta.pagamentoProjetistaId === i.id);
    const l = porAutoritativo ?? (soltaConfiavel ? porSolta : undefined);
    return {
      ...i,
      valor: Number(i.valor),
      forma: l?.forma?.nome ?? null,
      anexos: l?.anexos ?? [],
    };
  });
}

/** Extrato próprio do projetista: pagamentos por entrega validada (D35: + forma/comprovante). */
export async function meuExtrato(userId: string) {
  const brutos = await prisma.pagamentoProjetista.findMany({
    where: { projetistaId: userId },
    orderBy: { liberadoEm: "desc" },
    include: {
      disciplina: {
        select: { disciplinaTextoLegado: true, projeto: { select: { codigo: true, nome: true } } },
      },
    },
  });
  const total = brutos.reduce((s, p) => s + Number(p.valor), 0);
  const pago = brutos.filter((p) => p.status === "pago").reduce((s, p) => s + Number(p.valor), 0);
  const aberto = brutos.filter((p) => p.status === "pendente").reduce((s, p) => s + Number(p.valor), 0);
  const pagamentos = await comFormaEComprovantes(brutos);
  return { pagamentos, total, pago, aberto };
}

export type ExtratoItem = Awaited<ReturnType<typeof meuExtrato>>["pagamentos"][number];
