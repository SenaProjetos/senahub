import "server-only";
import { prisma } from "@/lib/prisma";
import { precisaAceitarTermo } from "@/modules/legal/queries";
import type { UsuarioDaSessao } from "@/modules/portal/acesso";
import { decidirAcessoPortal, MSG_PORTAL } from "@/modules/portal/acesso-regras";

/**
 * Quem pode ver e assinar os contratos de um cliente pelo portal (spec
 * `docs/superpowers/specs/2026-11-21-portal-assinatura-contrato-design.md`). A mesma porta do download das entregas
 * (`decidirAcessoPortal`), com o cliente do DOCUMENTO no lugar do cliente do projeto: conta externa, do mesmo cliente,
 * cliente ativo, senha trocada e termo aceito. Conta inativa também cai no 404 neutro.
 */

export type ContaDoPortal = { userId: string; nome: string; clienteId: string };

export type AcessoContaDoPortal =
  | { ok: true; conta: ContaDoPortal }
  | { ok: false; status: 401 | 403 | 404; erro: string };

export async function contaDoPortalParaCliente(
  user: UsuarioDaSessao | null,
  clienteIdDoDocumento: string | null,
): Promise<AcessoContaDoPortal> {
  const dono = user
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: { name: true, ativo: true, clienteId: true, cliente: { select: { ativo: true } } },
      })
    : null;
  const clienteId = dono?.clienteId ?? null;
  const clienteAtivo = dono?.cliente?.ativo ?? false;
  const ehDoCliente =
    user !== null &&
    user.tipo === "externo" &&
    dono?.ativo === true &&
    clienteId !== null &&
    clienteAtivo &&
    clienteIdDoDocumento === clienteId;
  // O termo só é consultado quando o documento é do cliente da pessoa — fora isso a resposta já é 404.
  const termoPendente = ehDoCliente && user ? (await precisaAceitarTermo(user)) !== null : false;

  const decisao = decidirAcessoPortal({
    temSessao: user !== null,
    tipo: user?.tipo ?? null,
    clienteId,
    mustChangePassword: user?.mustChangePassword ?? false,
    termoPendente,
    projetoClienteId: clienteIdDoDocumento,
    clienteAtivo,
  });
  if (!decisao.ok) return decisao;
  // Conta desativada: o mesmo 404 neutro (a regra pura não lê `User.ativo`).
  if (!user || !dono || !dono.ativo || !clienteId) return { ok: false, status: 404, erro: MSG_PORTAL.indisponivel };
  return { ok: true, conta: { userId: user.id, nome: dono.name, clienteId } };
}

/** Cliente do pedido, lido do documento (o pedido não guarda cópia). null = pedido inexistente ou documento sem cliente. */
export async function clienteDoPedido(pedidoId: string): Promise<string | null> {
  const pedido = await prisma.pedidoAssinaturaPortal.findUnique({
    where: { id: pedidoId },
    select: { documento: { select: { clienteId: true } } },
  });
  return pedido?.documento.clienteId ?? null;
}
