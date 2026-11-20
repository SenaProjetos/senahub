"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelarPedidoRevisao } from "@/modules/portal/pedido-revisao/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

/** "Cancelar pedido" do card do portal — a única parte com interação; o card fica no servidor. */
export function CancelarPedidoBotao({ id, prancha, modelo = false }: { id: string; prancha: string; modelo?: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pendente, startTransition] = useTransition();

  async function cancelar() {
    const ok = await confirm({
      title: "Cancelar o pedido?",
      description: `O pedido de revisão ${modelo ? "no modelo 3D" : `de ${prancha}`} sai da fila da equipe. Para pedir de novo, faça outro pedido.`,
      confirmLabel: "Cancelar pedido",
      variant: "destructive",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await cancelarPedidoRevisao({ id });
      if (r.ok) {
        toast.success("Pedido cancelado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Button size="sm" variant="ghost" onClick={() => void cancelar()} disabled={pendente}>
      {pendente ? "Cancelando…" : "Cancelar pedido"}
    </Button>
  );
}
