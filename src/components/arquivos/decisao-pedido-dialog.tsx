"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { aceitarPedidoRevisao, recusarPedidoRevisao } from "@/modules/portal/pedido-revisao/actions";
import { LIMITE_RESPOSTA } from "@/modules/portal/pedido-revisao/regras";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ModoDecisao = "aceitar" | "recusar";
export type PedidoEmDecisao = { id: string; prancha: string; revisao: string; autorNome: string };

/**
 * Diálogo único de decisão de um pedido do cliente (lista e detalhe). O próprio diálogo é a confirmação: aceitar
 * leva resposta opcional; recusar exige a resposta, que vai ao cliente. Quem usa passa `key` = pedido + modo, para a
 * resposta começar vazia a cada abertura.
 */
export function DecisaoPedidoDialog({
  pedido,
  modo,
  onFechar,
}: {
  pedido: PedidoEmDecisao | null;
  modo: ModoDecisao | null;
  onFechar: () => void;
}) {
  const router = useRouter();
  const [resposta, setResposta] = useState("");
  const [pendente, startTransition] = useTransition();
  const idResposta = useId();
  const aberto = pedido !== null && modo !== null;

  function decidir() {
    if (!pedido || !modo) return;
    startTransition(async () => {
      if (modo === "aceitar") {
        const r = await aceitarPedidoRevisao({ id: pedido.id, resposta: resposta.trim() || undefined });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        const partes = ["Pedido aceito."];
        if (r.data.emRevisao) partes.push('A prancha ficou "Em revisão".');
        else if (r.data.jaEstavaEmRevisao) partes.push('A prancha já estava "Em revisão".');
        if (r.data.rascunhos > 0) {
          partes.push(
            `${r.data.rascunhos} ${r.data.rascunhos === 1 ? "rascunho de apontamento ficou" : "rascunhos de apontamento ficaram"} com você.`,
          );
        }
        toast.success(partes.join(" "));
      } else {
        const r = await recusarPedidoRevisao({ id: pedido.id, resposta });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Pedido recusado. A resposta vai para o cliente.");
      }
      onFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !pendente && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{modo === "recusar" ? "Recusar o pedido" : "Aceitar o pedido"}</DialogTitle>
          <DialogDescription className="break-words">
            {pedido?.prancha} · {pedido?.revisao}, pedido por {pedido?.autorNome}.{" "}
            {modo === "recusar"
              ? "A resposta vai para o cliente."
              : 'A prancha fica "Em revisão" e as marcações do cliente viram rascunhos de apontamento com você.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-1.5">
            <Label htmlFor={idResposta}>{modo === "recusar" ? "Resposta ao cliente (obrigatória)" : "Resposta ao cliente (opcional)"}</Label>
            <textarea
              id={idResposta}
              rows={4}
              maxLength={LIMITE_RESPOSTA}
              aria-required={modo === "recusar"}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button
            variant={modo === "recusar" ? "destructive" : "default"}
            onClick={decidir}
            disabled={pendente || (modo === "recusar" && !resposta.trim())}
          >
            {pendente ? "Salvando…" : modo === "recusar" ? "Recusar pedido" : "Aceitar pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
