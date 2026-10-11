"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

/** Mínimo de caracteres do motivo — o mesmo do servidor (`MOTIVO_MINIMO` da folha, `motivoOk` do rateio). */
export const MOTIVO_MINIMO_TELA = 10;

type Resultado = { ok: true } | { ok: false; error: string };

/**
 * Diálogo de motivo para reabrir/recalcular (rateio do mês, folha): textarea de 10+ caracteres, o
 * erro do servidor em português no rodapé (fixo, para não ficar abaixo da dobra) e o diálogo só
 * fecha quando a ação deu certo. `onConfirmar` devolve o resultado da Server Action.
 */
export function MotivoDialog({
  titulo,
  descricao,
  rotuloConfirmar,
  perigoso = false,
  onConfirmar,
  onOpenChange,
}: {
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  /** Pinta o botão de vermelho (reabrir derruba assinaturas, por exemplo). */
  perigoso?: boolean;
  onConfirmar: (motivo: string) => Promise<Resultado>;
  onOpenChange: (aberto: boolean) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [pending, setPending] = useState(false);
  const curto = motivo.trim().length < MOTIVO_MINIMO_TELA;

  async function confirmar() {
    if (curto) {
      setErro(`Explique o motivo (pelo menos ${MOTIVO_MINIMO_TELA} caracteres).`);
      return;
    }
    setErro("");
    setPending(true);
    try {
      const r = await onConfirmar(motivo.trim());
      if (r.ok) onOpenChange(false);
      else setErro(r.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !(pending && !aberto) && onOpenChange(aberto)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-1.5">
          <Label htmlFor="motivo-dialog">Motivo</Label>
          <textarea
            id="motivo-dialog"
            rows={4}
            maxLength={500}
            autoFocus
            className="w-full resize-y rounded-sm border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            aria-invalid={!!erro}
            aria-describedby={erro ? "motivo-dialog-erro" : undefined}
          />
          <p className="text-xs text-muted-foreground">Fica registrado no histórico, com o seu nome e a data.</p>
        </DialogBody>
        <DialogFooter>
          {erro && (
            <p id="motivo-dialog-erro" role="alert" className="text-sm text-destructive sm:mr-auto sm:self-center">
              {erro}
            </p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant={perigoso ? "destructive" : "default"} onClick={() => void confirmar()} disabled={pending} loading={pending}>
            {rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
