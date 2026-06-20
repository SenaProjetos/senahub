"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Detecta a etapa "Perdido" pelo NOME (não há flag no schema; o seed cria
 * a etapa "Perdido"). Case-insensitive, por substring "perdid".
 * Definido aqui (módulo client-safe, sem back-imports) para ser compartilhado
 * pelo kanban e pelo modal sem criar dependência circular.
 */
export const etapaEhPerdido = (nome: string) => nome.toLowerCase().includes("perdid");

/**
 * Dialog que exige o "motivo da perda" antes de mover um lead para a
 * etapa "Perdido". O motivo é obrigatório (textarea não-vazio).
 */
export function MotivoPerdaDialog({
  open,
  leadNome,
  onOpenChange,
  onConfirmar,
}: {
  open: boolean;
  leadNome: string;
  onOpenChange: (o: boolean) => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");

  // Reseta o textarea ao reabrir para outro lead.
  const [lastOpen, setLastOpen] = useState(open);
  if (lastOpen !== open) {
    setLastOpen(open);
    if (open) setMotivo("");
  }

  function confirmar() {
    const m = motivo.trim();
    if (!m) return;
    onConfirmar(m);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Motivo da perda</DialogTitle>
          <DialogDescription>
            Por que o lead{leadNome ? ` "${leadNome}"` : ""} foi perdido? O motivo é obrigatório.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="motivo-perda">Motivo</Label>
          <textarea
            id="motivo-perda"
            autoFocus
            rows={4}
            className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            placeholder="Ex.: preço acima do orçamento, escolheu concorrente…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!motivo.trim()}>
            Confirmar perda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
