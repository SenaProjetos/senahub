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
 * Pede o motivo ANTES de marcar a proposta como recusada (F5.10) — mesmo catálogo `MotivoPerda`
 * de `Negociacao` (não um segundo catálogo para a mesma classificação), mesmo desenho de tela
 * que `MotivoPerdaNegociacaoDialog`. Motivo é obrigatório; concorrente vira obrigatório quando o
 * motivo escolhido pede.
 *
 * Recusar a PROPOSTA não é o mesmo que perder a NEGOCIAÇÃO — o cliente pode responder com uma v2
 * (o status é reversível, F5.5). Por isso um diálogo próprio, não o mesmo componente reaproveitado
 * escondendo a diferença.
 */
export function MotivoRecusaPropostaDialog({
  numero,
  motivos,
  onCancelar,
  onConfirmar,
}: {
  numero: string;
  motivos: MotivoPerdaOpcao[];
  onCancelar: () => void;
  onConfirmar: (motivoPerdaId: string, concorrente: string, observacao: string) => void;
}) {
  const [motivoId, setMotivoId] = useState<string>("");
  const [concorrente, setConcorrente] = useState("");
  const [observacao, setObservacao] = useState("");
  const motivo = motivos.find((m) => m.id === motivoId) ?? null;
  const precisaConcorrente = exigeConcorrente(motivo);
  const podeConfirmar = Boolean(motivoId) && (!precisaConcorrente || concorrente.trim().length > 0);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancelar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recusar proposta</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{numero}</p>
          <div className="space-y-1.5">
            <Label>Motivo da recusa</Label>
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
          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <textarea
              rows={2}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              placeholder="Algo específico deste caso, além do motivo"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button
            disabled={!podeConfirmar}
            onClick={() => onConfirmar(motivoId, concorrente.trim(), observacao.trim())}
          >
            Confirmar recusa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
