import "server-only";
import { prisma } from "@/lib/prisma";
import { motivoParaNaoPedir, rotuloSituacaoEquipe, situacaoDoPedido, type SituacaoPedido } from "./regras";

/**
 * O pedido de assinatura pelo portal visto do Jurídico: a situação de cada pedido por versão e o motivo que impede
 * pedir na versão VIGENTE (a mesma frase do `ActionError` do serviço). Só leitura — não puxa o serviço (e-mail, sino).
 */

export type PedidoNaVersao = {
  id: string;
  situacao: SituacaoPedido;
  rotulo: string;
  pedidoPorNome: string;
  pedidoEm: string;
  assinadoPorNome: string | null;
  assinadoEm: string | null;
  canceladoEm: string | null;
};

export type PortalDoDocumento = {
  motivoParaNaoPedir: string | null;
  contasAtivas: number;
  /** Por `DocJuridicoVersao.id`, o pedido mais recente primeiro. */
  pedidosPorVersao: Record<string, PedidoNaVersao[]>;
};

const MOTIVO_SEM_VERSAO = "O documento ainda não tem versão.";

export async function portalDosDocumentos(documentoIds: string[]): Promise<Record<string, PortalDoDocumento>> {
  const ids = [...new Set(documentoIds)];
  if (ids.length === 0) return {};
  const documentos = await prisma.documentoJuridico.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      tipo: true,
      vinculoId: true,
      clienteId: true,
      projetoId: true,
      statusContrato: true,
      cliente: { select: { ativo: true } },
      projeto: { select: { clienteId: true } },
      versoes: { select: { id: true, numero: true, arquivoNome: true }, orderBy: { numero: "desc" } },
    },
  });
  const clienteIds = [...new Set(documentos.map((d) => d.clienteId).filter((c): c is string => !!c))];
  const contas = clienteIds.length
    ? await prisma.user.groupBy({
        by: ["clienteId"],
        where: { tipo: "externo", ativo: true, clienteId: { in: clienteIds } },
        _count: { _all: true },
      })
    : [];
  const contasPorCliente = new Map(contas.map((c) => [c.clienteId, c._count._all]));
  const pedidos = await prisma.pedidoAssinaturaPortal.findMany({
    where: { documentoId: { in: ids } },
    orderBy: { pedidoEm: "desc" },
    select: {
      id: true,
      documentoId: true,
      versaoId: true,
      status: true,
      pedidoPorId: true,
      pedidoEm: true,
      assinadoPorNome: true,
      assinadoEm: true,
      canceladoEm: true,
    },
  });
  const autores = pedidos.length
    ? await prisma.user.findMany({
        where: { id: { in: [...new Set(pedidos.map((p) => p.pedidoPorId))] } },
        select: { id: true, name: true },
      })
    : [];
  const nomePorId = new Map(autores.map((u) => [u.id, u.name]));

  const resultado: Record<string, PortalDoDocumento> = {};
  for (const d of documentos) {
    const vigente = d.versoes[0];
    const numeroPorVersao = new Map(d.versoes.map((v) => [v.id, v.numero]));
    const dele = pedidos.filter((p) => p.documentoId === d.id);
    const contasAtivas = d.clienteId ? (contasPorCliente.get(d.clienteId) ?? 0) : 0;

    const pedidosPorVersao: Record<string, PedidoNaVersao[]> = {};
    for (const p of dele) {
      const situacao = situacaoDoPedido(
        { status: p.status, versaoNumero: numeroPorVersao.get(p.versaoId) ?? 0 },
        { versaoVigenteNumero: vigente?.numero ?? 0, statusContrato: d.statusContrato },
      );
      (pedidosPorVersao[p.versaoId] ??= []).push({
        id: p.id,
        situacao,
        rotulo: rotuloSituacaoEquipe(situacao),
        pedidoPorNome: nomePorId.get(p.pedidoPorId) ?? "—",
        pedidoEm: p.pedidoEm.toISOString(),
        assinadoPorNome: p.assinadoPorNome,
        assinadoEm: p.assinadoEm?.toISOString() ?? null,
        canceladoEm: p.canceladoEm?.toISOString() ?? null,
      });
    }

    const motivo = vigente
      ? motivoParaNaoPedir({
          tipo: d.tipo,
          vinculoId: d.vinculoId,
          clienteId: d.clienteId,
          clienteAtivo: d.cliente?.ativo ?? false,
          projetoClienteId: d.projetoId ? (d.projeto?.clienteId ?? null) : undefined,
          contasAtivas,
          versaoNumero: vigente.numero,
          versaoVigenteNumero: vigente.numero,
          arquivoNome: vigente.arquivoNome,
          statusContrato: d.statusContrato,
          temPedidoAguardandoNaVigente: dele.some((p) => p.status === "aguardando" && p.versaoId === vigente.id),
          temPedidoAssinadoNaVigente: dele.some((p) => p.status === "assinado" && p.versaoId === vigente.id),
        })
      : MOTIVO_SEM_VERSAO;
    resultado[d.id] = { motivoParaNaoPedir: motivo, contasAtivas, pedidosPorVersao };
  }
  return resultado;
}
