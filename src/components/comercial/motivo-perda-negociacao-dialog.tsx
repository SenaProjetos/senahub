"use client";

import { useState } from "react";
import type { MotivoPerdaOpcao } from "@/modules/comercial/queries";
import { exigeConcorrente } from "@/modules/comercial/jornada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Pede o motivo ANTES de mover para PERDIDO (F2.14).
 *
 * O motivo é obrigatório (`exigeMotivoPerda`) e o concorrente vira obrigatório quando o motivo
 * escolhido pede — regra que mora no DADO (`MotivoPerda.exigeConcorrente`), não numa lista no
 * código, para o catálogo crescer sem deploy.
 *
 * Perguntar aqui, e não depois num toast de erro, evita obrigar a arrastar o card duas vezes.
 */
export function MotivoPerdaNegociacaoDialog({
  titulo,
  motivos,
  onCancelar,
  onConfirmar,
}: {
  titulo: string;
  motivos: MotivoPerdaOpcao[];
  onCancelar: () => void;
  onConfirmar: (motivoPerdaId: string, concorrente: string) => void;
}) {
  const [motivoId, setMotivoId] = useState<string>("");
  const [concorrente, setConcorrente] = useState("");
  const motivo = motivos.find((m) => m.id === motivoId) ?? null;
  const precisaConcorrente = exigeConcorrente(motivo);
  const podeConfirmar = Boolean(motivoId) && (!precisaConcorrente || concorrente.trim().length > 0);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancelar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como perdida</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{titulo}</p>
          <div className="space-y-1.5">
            <Label>Motivo da perda</Label>
            <Select value={motivoId} onValueChange={(v) => setMotivoId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {motivos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {precisaConcorrente && (
            <div className="space-y-1.5">
              <Label>Concorrente</Label>
              <Input
                value={concorrente}
                onChange={(e) => setConcorrente(e.target.value)}
                placeholder="Para quem perdemos"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button
            disabled={!podeConfirmar}
            onClick={() => onConfirmar(motivoId, concorrente.trim())}
          >
            Confirmar perda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
