import "server-only";
import { prisma } from "@/lib/prisma";
import { marcaDaParcela, type PacoteDaParcela } from "@/modules/portal/aprovacao-entrega/marca";
import { listarParcelasAFaturar, type ParcelaAFaturar } from "./parcelas-a-faturar";

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * As parcelas de contrato por entrega a faturar (L2) — leitura para o financeiro. Só contrato de
 * cliente vigente (assinado ou vencido: a vigência acabou, o dinheiro não). A regra da lista está em
 * `parcelas-a-faturar.ts`. Com `projetoId` e `clienteId`, só as daquele projeto e cliente (o seletor da aprovação da
 * entrega).
 */
export async function parcelasAFaturar(filtro: { projetoId?: string; clienteId?: string } = {}): Promise<ParcelaAFaturar[]> {
  const contratos = await prisma.documentoJuridico.findMany({
    where: {
      formaCobranca: "por_entrega",
      statusContrato: { in: ["assinado", "vencido"] },
      vinculoId: null,
      clienteId: filtro.clienteId ? filtro.clienteId : { not: null },
      ...(filtro.projetoId ? { projetoId: filtro.projetoId } : {}),
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

  const lista = listarParcelasAFaturar(
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
  return comAceite(lista);
}

/** Preenche `aceite` com os pacotes de entrega ligados a cada parcela listada (só a resposta ATIVA conta). */
async function comAceite(lista: ParcelaAFaturar[]): Promise<ParcelaAFaturar[]> {
  if (lista.length === 0) return lista;
  const pacotes = await prisma.aprovacaoEntrega.findMany({
    where: { parcelaId: { in: lista.map((p) => p.parcelaId) } },
    select: {
      parcelaId: true,
      titulo: true,
      status: true,
      enviadoEm: true,
      respostas: { where: { anuladaEm: null }, select: { resposta: true, respondidoEm: true }, take: 1 },
    },
  });
  if (pacotes.length === 0) return lista;
  const porParcela = new Map<string, PacoteDaParcela[]>();
  for (const p of pacotes) {
    if (!p.parcelaId) continue;
    const r = p.respostas[0] ?? null;
    const arr = porParcela.get(p.parcelaId) ?? [];
    arr.push({ titulo: p.titulo, status: p.status, enviadoEm: p.enviadoEm, resposta: r ? { resposta: r.resposta, respondidoEm: r.respondidoEm } : null });
    porParcela.set(p.parcelaId, arr);
  }
  return lista.map((p) => ({ ...p, aceite: marcaDaParcela(porParcela.get(p.parcelaId) ?? []) }));
}
