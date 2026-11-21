import "server-only";
import { prisma } from "@/lib/prisma";
import type { UsuarioDaSessao } from "@/modules/portal/acesso";
import { contaDoPortalParaCliente, type ContaDoPortal } from "./acesso";
import { situacaoDoPedido, visivelNoPortal } from "./regras";

/**
 * Decide se uma conta do portal pode ler o PDF de um pedido de assinatura (spec
 * `docs/superpowers/specs/2026-11-21-portal-assinatura-contrato-design.md`). Serve a versão DO PEDIDO — a assinada
 * continua legível mesmo depois de uma versão nova. Pedido inexistente, de outro cliente, cancelado, de versão
 * substituída ou de contrato encerrado respondem o mesmo 404 neutro, sem vazar o título.
 */

export const MSG_ARQUIVO_INDISPONIVEL = "Arquivo indisponível.";

export type ArquivoDoPedido =
  | { ok: true; versao: { id: string; arquivoPath: string; arquivoNome: string }; conta: ContaDoPortal }
  | { ok: false; status: 401 | 403 | 404; erro: string };

export async function arquivoDoPedidoParaConta(user: UsuarioDaSessao | null, pedidoId: string): Promise<ArquivoDoPedido> {
  const pedido = await prisma.pedidoAssinaturaPortal.findUnique({
    where: { id: pedidoId },
    select: {
      status: true,
      documentoId: true,
      versao: { select: { id: true, numero: true, arquivoPath: true, arquivoNome: true } },
      documento: { select: { clienteId: true, statusContrato: true } },
    },
  });

  // Sem pedido, o cliente do documento é null: sem sessão cai em 401 e com sessão no 404 neutro.
  const acesso = await contaDoPortalParaCliente(user, pedido?.documento.clienteId ?? null);
  if (!acesso.ok) return acesso;
  if (!pedido) return { ok: false, status: 404, erro: MSG_ARQUIVO_INDISPONIVEL };

  const vigente = await prisma.docJuridicoVersao.aggregate({
    where: { documentoId: pedido.documentoId },
    _max: { numero: true },
  });
  const situacao = situacaoDoPedido(
    { status: pedido.status, versaoNumero: pedido.versao.numero },
    { versaoVigenteNumero: vigente._max.numero ?? 0, statusContrato: pedido.documento.statusContrato },
  );
  if (!visivelNoPortal(situacao)) return { ok: false, status: 404, erro: MSG_ARQUIVO_INDISPONIVEL };

  const { id, arquivoPath, arquivoNome } = pedido.versao;
  return { ok: true, versao: { id, arquivoPath, arquivoNome }, conta: acesso.conta };
}
