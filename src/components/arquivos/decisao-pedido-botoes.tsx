"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DecisaoPedidoDialog, type ModoDecisao, type PedidoEmDecisao } from "@/components/arquivos/decisao-pedido-dialog";

/** Aceitar…/Recusar… do detalhe do pedido — a única parte com interação; o detalhe fica no servidor. */
export function DecisaoPedidoBotoes({ pedido, motivoNaoAceitar }: { pedido: PedidoEmDecisao; motivoNaoAceitar: string | null }) {
  const [modo, setModo] = useState<ModoDecisao | null>(null);
  return (
    <>
      <Button
        size="sm"
        onClick={() => setModo("aceitar")}
        disabled={motivoNaoAceitar !== null}
        title={motivoNaoAceitar ?? undefined}
        aria-describedby={motivoNaoAceitar ? "motivo-nao-aceitar" : undefined}
      >
        Aceitar…
      </Button>
      <Button size="sm" variant="outline" onClick={() => setModo("recusar")}>
        Recusar…
      </Button>
      <DecisaoPedidoDialog key={modo ?? "fechado"} pedido={pedido} modo={modo} onFechar={() => setModo(null)} />
    </>
  );
}
