import { cn } from "@/lib/utils";
import { classeDoStatus } from "@/modules/uploads/status-documento";
import {
  MOTIVO_PRANCHA_RETIRADA,
  MOTIVO_REVISAO_SUBSTITUIDA,
  MOTIVO_SEM_VALIDAR,
  type StatusPedido,
} from "@/modules/portal/pedido-revisao/regras";

/** Motivo para não aceitar que a TELA já sabe (o servidor confere tudo de novo). */
export function motivoNaTela(p: { indisponivel: "substituida" | "retirada" | null }, podeValidar: boolean): string | null {
  if (!podeValidar) return MOTIVO_SEM_VALIDAR;
  if (p.indisponivel === "substituida") return MOTIVO_REVISAO_SUBSTITUIDA;
  if (p.indisponivel === "retirada") return MOTIVO_PRANCHA_RETIRADA;
  return null;
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

/** O pedido não pode mais ser aceito: a prancha ganhou revisão nova, ou saiu das Entregas. */
export function SeloIndisponivel({ tipo }: { tipo: "substituida" | "retirada" }) {
  return (
    <span className={cn(CLASSE_SELO, classeDoStatus("neutro"))}>{tipo === "substituida" ? "Revisão substituída" : "Prancha retirada"}</span>
  );
}

export function SeloPedidoAguardando() {
  return <span className={cn(CLASSE_SELO, classeDoStatus("aguardando"))}>Pedido aguardando</span>;
}
