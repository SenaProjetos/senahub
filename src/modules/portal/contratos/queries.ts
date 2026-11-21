import "server-only";
import { prisma } from "@/lib/prisma";
import { rotuloTipoDocumento, situacaoDoPedido, visivelNoPortal } from "./regras";

/**
 * Os contratos que o portal mostra ao cliente: só o que a equipe pediu pelo portal, por situação (spec
 * `docs/superpowers/specs/2026-11-21-portal-assinatura-contrato-design.md`, tabela "O que o portal mostra"). Cliente
 * e projeto vêm do `DocumentoJuridico`. O acesso da conta (cliente ativo, termo) é da página/rota, não daqui.
 */

export type ContratoDoPortal = {
  pedidoId: string;
  titulo: string;
  tipoRotulo: string;
  versaoNumero: number;
  arquivoNome: string;
  pedidoPorNome: string;
  pedidoEm: string;
  situacao: "aguardando" | "assinado";
  assinadoPorNome: string | null;
  assinadoEm: string | null;
};

/** `projetoId` null = documentos do cliente SEM projeto (o card de "Meus projetos"). */
export async function contratosDoPortal(clienteId: string, projetoId: string | null): Promise<ContratoDoPortal[]> {
  const pedidos = await prisma.pedidoAssinaturaPortal.findMany({
    where: {
      status: { in: ["aguardando", "assinado"] },
      documento: { clienteId, projetoId },
    },
    select: {
      id: true,
      status: true,
      pedidoPorId: true,
      pedidoEm: true,
      assinadoPorNome: true,
      assinadoEm: true,
      documentoId: true,
      versao: { select: { numero: true, arquivoNome: true } },
      documento: { select: { titulo: true, tipo: true, statusContrato: true } },
    },
  });
  if (pedidos.length === 0) return [];

  const documentoIds = [...new Set(pedidos.map((p) => p.documentoId))];
  const vigentes = await prisma.docJuridicoVersao.groupBy({
    by: ["documentoId"],
    where: { documentoId: { in: documentoIds } },
    _max: { numero: true },
  });
  const vigentePorDocumento = new Map(vigentes.map((v) => [v.documentoId, v._max.numero ?? 0]));
  const autores = await prisma.user.findMany({
    where: { id: { in: [...new Set(pedidos.map((p) => p.pedidoPorId))] } },
    select: { id: true, name: true },
  });
  const nomePorId = new Map(autores.map((u) => [u.id, u.name]));

  const itens: ContratoDoPortal[] = [];
  for (const p of pedidos) {
    const situacao = situacaoDoPedido(
      { status: p.status, versaoNumero: p.versao.numero },
      { versaoVigenteNumero: vigentePorDocumento.get(p.documentoId) ?? 0, statusContrato: p.documento.statusContrato },
    );
    if (!visivelNoPortal(situacao)) continue;
    itens.push({
      pedidoId: p.id,
      titulo: p.documento.titulo,
      tipoRotulo: rotuloTipoDocumento(p.documento.tipo),
      versaoNumero: p.versao.numero,
      arquivoNome: p.versao.arquivoNome,
      pedidoPorNome: nomePorId.get(p.pedidoPorId) ?? "Equipe",
      pedidoEm: p.pedidoEm.toISOString(),
      situacao: situacao === "assinado" ? "assinado" : "aguardando",
      assinadoPorNome: p.assinadoPorNome,
      assinadoEm: p.assinadoEm?.toISOString() ?? null,
    });
  }
  // Aguardando primeiro; dentro de cada grupo, o pedido mais recente antes.
  return itens.sort((a, b) => {
    if (a.situacao !== b.situacao) return a.situacao === "aguardando" ? -1 : 1;
    return b.pedidoEm.localeCompare(a.pedidoEm);
  });
}
