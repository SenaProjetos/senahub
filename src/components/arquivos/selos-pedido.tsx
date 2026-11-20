import { cn } from "@/lib/utils";
import { classeDoStatus } from "@/modules/uploads/status-documento";
import type { StatusPedido } from "@/modules/portal/pedido-revisao/regras";
import { motivoNaTelaDoPedido, rotuloIndisponivel, type TipoPedido } from "@/modules/portal/pedido-revisao/modelo-regras";

/** O que a tela sabe de quem decide: `uploads:validar` (prancha) e `coordenacao:gerir` (modelo 3D), lidos no servidor. */
export type PoderesNaFila = { podeValidar: boolean; podeCoordenar: boolean };

/** Motivo para não aceitar que a TELA já sabe (o servidor confere tudo de novo). */
export function motivoNaTela(
  p: { tipo: TipoPedido; indisponivel: "substituida" | "retirada" | null },
  poderes: PoderesNaFila,
): string | null {
  return motivoNaTelaDoPedido(p, poderes);
}

/**
 * Selos do pedido de revisão do cliente, sem hooks e sem `"use client"`: servem à fila da coordenação e ao portal sem
 * levar o código da coordenação (menus, ações de aceitar/recusar) para o bundle do portal.
 */

const CLASSE_SELO = "shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium leading-none";

/** Cor de cada situação pelos tokens de status do sistema (`classeDoStatus`). */
const COR_STATUS: Record<StatusPedido, string> = { aguardando: "aguardando", aceito: "aprovado", recusado: "perigo", cancelado: "neutro" };

export function SeloStatusPedido({ status, rotulo }: { status: StatusPedido; rotulo: string }) {
  return <span className={cn(CLASSE_SELO, classeDoStatus(COR_STATUS[status]))}>{rotulo}</span>;
}

/** O pedido não pode mais ser aceito: a prancha (ou um modelo marcado) ganhou revisão nova, ou saiu das Entregas. */
export function SeloIndisponivel({ tipo, pedido = "prancha" }: { tipo: "substituida" | "retirada"; pedido?: TipoPedido }) {
  return <span className={cn(CLASSE_SELO, classeDoStatus("neutro"))}>{rotuloIndisponivel(pedido, tipo)}</span>;
}

export function SeloPedidoAguardando() {
  return <span className={cn(CLASSE_SELO, classeDoStatus("aguardando"))}>Pedido aguardando</span>;
}
