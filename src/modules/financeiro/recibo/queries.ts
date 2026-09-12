import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

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
