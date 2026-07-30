import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { detalheRfq } from "@/modules/custos/cotacoes/queries";
import { RfqDetalheView } from "@/components/custos/cotacoes/rfq-detalhe-view";

export const metadata: Metadata = { title: "RFQ — Engenharia de Custos" };

export default async function RfqDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("custos", "cotacao");
  const { id } = await params;
  const rfq = await detalheRfq(id);
  if (!rfq) notFound();

  return (
    <RfqDetalheView
      rfq={{
        id: rfq.id,
        titulo: rfq.titulo,
        descricao: rfq.descricao,
        status: rfq.status,
        prazoResposta: rfq.prazoResposta,
        orcamentoTitulo: rfq.orcamento?.titulo ?? null,
        criadoPorNome: rfq.criadoPor.name,
        createdAt: rfq.createdAt,
        itens: rfq.itens.map((i) => ({
          id: i.id,
          descricao: i.descricao,
          quantidade: Number(i.quantidade),
          unidade: i.unidade,
          insumoId: i.insumoId,
        })),
        convites: rfq.convites.map((c) => ({
          id: c.id,
          fornecedorId: c.fornecedorId,
          fornecedorNome: c.fornecedor.nome,
          status: c.status,
          convidadoEm: c.convidadoEm,
          respondidoEm: c.respondidoEm,
        })),
        propostas: rfq.propostas.map((p) => ({
          id: p.id,
          fornecedorId: p.fornecedorId,
          fornecedorNome: p.fornecedor.nome,
          status: p.status,
          frete: p.frete != null ? Number(p.frete) : 0,
          impostosInclusos: p.impostosInclusos,
          impostosValor: p.impostosValor != null ? Number(p.impostosValor) : null,
          prazoEntregaDias: p.prazoEntregaDias,
          validadeAte: p.validadeAte,
          condicoesPagamento: p.condicoesPagamento,
          observacoes: p.observacoes,
          justificativaEscolha: p.justificativaEscolha,
          escolhidoPorNome: p.escolhidoPor?.name ?? null,
          escolhidoEm: p.escolhidoEm,
          criadoPorNome: p.criadoPor.name,
          createdAt: p.createdAt,
          itens: p.itens.map((it) => ({ id: it.id, rfqItemId: it.rfqItemId, precoUnitario: Number(it.precoUnitario), observacao: it.observacao })),
          anexos: p.anexos.map((a) => ({ id: a.id, nome: a.nome, mime: a.mime, tamanho: a.tamanho })),
        })),
      }}
      comparacao={rfq.comparacao.map((c) => ({
        propostaId: c.propostaId,
        fornecedorNome: c.fornecedorNome,
        totalComparavel: c.totalComparavel,
        itensFaltando: c.itensFaltando,
        prazoEntregaDias: c.prazoEntregaDias,
        validadeAte: c.validadeAte,
        avaliacaoFornecedor: c.avaliacaoFornecedor,
        status: c.status,
      }))}
    />
  );
}
