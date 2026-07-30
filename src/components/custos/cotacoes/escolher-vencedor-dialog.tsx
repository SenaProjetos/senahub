"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { escolherVencedor } from "@/modules/custos/cotacoes/actions";

export function EscolherVencedorDialog({ propostaId, fornecedorNome }: { propostaId: string; fornecedorNome: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [justificativa, setJustificativa] = useState("");

  function confirmar() {
    if (justificativa.trim().length < 10) {
      toast.error("Justifique a escolha (mín. 10 caracteres).");
      return;
    }
    startTransition(async () => {
      const r = await escolherVencedor({ propostaId, justificativaEscolha: justificativa.trim() });
      if (r.ok) {
        toast.success("Vencedor escolhido — RFQ encerrada.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Trophy className="size-4" /> Escolher vencedor
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escolher {fornecedorNome} como vencedor?</DialogTitle>
          <DialogDescription>
            As demais propostas desta RFQ ficam marcadas como não escolhidas (preservadas, nunca apagadas). O preço de cada item
            vencedor entra no histórico de preços.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="justificativa">Justificativa da escolha</Label>
          <textarea
            id="justificativa"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            rows={3}
            maxLength={500}
            autoFocus
            className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || justificativa.trim().length < 10}>
            {pending ? "Confirmando…" : "Confirmar escolha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
