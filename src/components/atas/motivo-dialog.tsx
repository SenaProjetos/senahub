"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
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

export const CLASSE_TEXTAREA =
  "w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

type Resultado = { ok: true } | { ok: false; error: string };

/**
 * Diálogo de motivo obrigatório (retirar ata, reabrir pendência) — o diálogo É a confirmação. Falha de rede vira toast.
 */
export function MotivoDialog({
  aberto,
  titulo,
  descricao,
  ajuda,
  rotuloConfirmar,
  max,
  destrutivo = true,
  obrigatorio = true,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean;
  titulo: string;
  descricao: string;
  ajuda: string;
  rotuloConfirmar: string;
  max: number;
  destrutivo?: boolean;
  /** `false` = o motivo é opcional (o botão confirma com o campo vazio). */
  obrigatorio?: boolean;
  onFechar: () => void;
  onConfirmar: (motivo: string) => Promise<Resultado>;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, startTransition] = useTransition();
  const idMotivo = useId();
  const idAjuda = useId();

  function confirmar() {
    startTransition(async () => {
      const r = await onConfirmar(motivo).catch(() => null);
      if (!r) {
        toast.error("Não foi possível enviar. Verifique a conexão e tente de novo.");
        return;
      }
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setMotivo("");
      onFechar();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !enviando && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription className="break-words">{descricao}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-1.5">
          <Label htmlFor={idMotivo}>{obrigatorio ? "Motivo" : "Motivo (opcional)"}</Label>
          <textarea
            id={idMotivo}
            rows={3}
            maxLength={max}
            aria-describedby={idAjuda}
            className={CLASSE_TEXTAREA}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={enviando}
          />
          <p id={idAjuda} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>{ajuda}</span>
            <span className="font-mono">
              {motivo.length}/{max}
            </span>
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button variant={destrutivo ? "destructive" : "default"} onClick={confirmar} disabled={enviando || (obrigatorio && motivo.trim().length === 0)}>
            <span role="status">{enviando ? "Enviando…" : rotuloConfirmar}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
