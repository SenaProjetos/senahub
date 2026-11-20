import { cn } from "@/lib/utils";
import { classeDoStatus } from "@/modules/uploads/status-documento";
import type { StatusPedido } from "@/modules/portal/pedido-revisao/regras";

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

export function SeloRevisaoSubstituida() {
  return <span className={cn(CLASSE_SELO, classeDoStatus("neutro"))}>Revisão substituída</span>;
}

export function SeloPedidoAguardando() {
  return <span className={cn(CLASSE_SELO, classeDoStatus("aguardando"))}>Pedido aguardando</span>;
}
