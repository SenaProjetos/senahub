"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { anularRespostaAprovacao } from "@/modules/portal/aprovacao-entrega/actions";
import { MOTIVO_ANULACAO_MAX } from "@/modules/portal/aprovacao-entrega/regras";
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

/**
 * Anular a resposta ativa de um pedido de aprovação — o diálogo É a confirmação. Nada é apagado: a resposta fica riscada
 * com o motivo (o cliente também vê), o pedido volta a aguardar e a parcela ligada deixa de contar este aceite.
 */
export function AnularRespostaDialog({
  respostaId,
  titulo,
  aberto,
  onFechar,
}: {
  respostaId: string;
  titulo: string;
  aberto: boolean;
  onFechar: () => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [enviando, startTransition] = useTransition();
  const idMotivo = useId();
  const idAjuda = useId();

  function anular() {
    startTransition(async () => {
      const r = await anularRespostaAprovacao({ respostaId, motivo });
      if (!r.ok) {
        toast.error(r.error);
        router.refresh();
        return;
      }
      toast.success("Resposta anulada. O pedido voltou a aguardar.");
      setMotivo("");
      onFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !enviando && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Anular a resposta?</DialogTitle>
          <DialogDescription className="break-words">{titulo}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-1.5">
          <Label htmlFor={idMotivo}>Motivo</Label>
          <textarea
            id={idMotivo}
            rows={3}
            maxLength={MOTIVO_ANULACAO_MAX}
            aria-describedby={idAjuda}
            className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={enviando}
          />
          <p id={idAjuda} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>A resposta continua visível, riscada, com este motivo — também para o cliente.</span>
            <span className="font-mono">
              {motivo.length}/{MOTIVO_ANULACAO_MAX}
            </span>
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={anular} disabled={enviando || motivo.trim().length === 0}>
            <span role="status">{enviando ? "Anulando…" : "Anular resposta"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
