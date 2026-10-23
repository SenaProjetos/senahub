"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Mudar o início do projeto com tarefas de DATA FIXADA (o alfinete): as datas fixadas andam junto ("Mover junto": os mesmos
 * dias úteis que o início andou) ou ficam onde estão ("Manter", e elas podem não acompanhar o novo início). Sem tarefa
 * fixada a pergunta nem aparece. Cancelar não grava nada.
 */
export function InicioProjetoDialog({
  aberto,
  linhasFixadas,
  inicioAtual,
  novoInicio,
  pendente,
  onMover,
  onManter,
  onCancelar,
}: {
  aberto: boolean;
  linhasFixadas: number;
  /** `YYYY-MM-DD`. */
  inicioAtual: string | null;
  novoInicio: string;
  pendente: boolean;
  onMover: () => void;
  onManter: () => void;
  onCancelar: () => void;
}) {
  const br = (iso: string) => iso.split("-").reverse().join("/");
  const tarefas = linhasFixadas === 1 ? "1 tarefa tem" : `${linhasFixadas} tarefas têm`;
  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && !pendente && onCancelar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mudar o início do projeto{inicioAtual ? ` de ${br(inicioAtual)}` : ""} para {br(novoInicio)}?</DialogTitle>
          <DialogDescription>
            {tarefas} data fixada (o alfinete). <strong>Mover junto</strong> desloca essas datas pelos mesmos dias úteis que o início andou.{" "}
            <strong>Manter</strong> deixa as datas onde estão — elas ficam travadas e podem não acompanhar o novo início.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onCancelar} disabled={pendente}>
            Cancelar
          </Button>
          <Button type="button" variant="outline" onClick={onManter} disabled={pendente}>
            Manter as datas
          </Button>
          <Button type="button" onClick={onMover} disabled={pendente}>
            {pendente ? "Gravando…" : "Mover junto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
