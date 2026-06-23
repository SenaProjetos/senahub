"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { salvarCalculo } from "@/modules/ferramentas/actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ferramenta: string;
  tituloSugerido: string;
  entradas: Record<string, unknown>;
  onSalvo: (id: string) => void;
};

export function SalvarDialog({ open, onOpenChange, ferramenta, tituloSugerido, entradas, onSalvo }: Props) {
  const [titulo, setTitulo] = useState(tituloSugerido);
  const [pending, startTransition] = useTransition();

  // Atualiza o titulo quando abre com novo tituloSugerido
  if (open && titulo !== tituloSugerido && !titulo) setTitulo(tituloSugerido);

  function handleSalvar() {
    if (!titulo.trim()) {
      toast.error("Informe um título para o cálculo.");
      return;
    }
    startTransition(async () => {
      const r = await salvarCalculo({ ferramenta, titulo: titulo.trim(), entradas });
      if (r.ok) {
        toast.success(`Cálculo "${titulo.trim()}" salvo.`);
        onSalvo(r.data.id);
        onOpenChange(false);
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Salvar cálculo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="titulo-calculo">Nome do cálculo</Label>
            <Input
              id="titulo-calculo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Conversor kN para tf — Pilar P1"
              onKeyDown={(e) => e.key === "Enter" && handleSalvar()}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={pending || !titulo.trim()}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
