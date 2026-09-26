import "server-only";
import { prisma } from "@/lib/prisma";
import { listarParcelasAFaturar, type ParcelaAFaturar } from "./parcelas-a-faturar";

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * As parcelas de contrato por entrega a faturar (L2) — leitura para o financeiro. Só contrato de
 * cliente vigente (assinado ou vencido: a vigência acabou, o dinheiro não). A regra da lista está em
 * `parcelas-a-faturar.ts`.
 */
export async function parcelasAFaturar(): Promise<ParcelaAFaturar[]> {
  const contratos = await prisma.documentoJuridico.findMany({
    where: {
      formaCobranca: "por_entrega",
      statusContrato: { in: ["assinado", "vencido"] },
      vinculoId: null,
      clienteId: { not: null },
    },
    select: {
      id: true,
      titulo: true,
      valor: true,
      cliente: { select: { nome: true } },
      projeto: { select: { id: true, codigo: true, nome: true } },
      parcelasEntrega: {
        select: {
          id: true,
          descricao: true,
          percentual: true,
          ordem: true,
          naAssinatura: true,
          marco: { select: { nome: true, status: true } },
          lancamento: { select: { status: true, vencimento: true, excluidoEm: true } },
        },
      },
    },
  });

  return listarParcelasAFaturar(
    contratos.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      valor: c.valor == null ? null : Number(c.valor),
      cliente: c.cliente?.nome ?? null,
      projeto: c.projeto,
      parcelas: c.parcelasEntrega.map((p) => ({
        id: p.id,
        descricao: p.descricao,
        percentual: Number(p.percentual),
        ordem: p.ordem,
        naAssinatura: p.naAssinatura,
        marco: p.marco,
        lancamento: p.lancamento
          ? {
              status: p.lancamento.status,
              vencimento: dia(p.lancamento.vencimento),
              excluidoEm: p.lancamento.excluidoEm?.toISOString() ?? null,
            }
          : null,
      })),
    })),
  );
}
