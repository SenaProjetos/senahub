"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ApontamentoDraft = { titulo: string; texto: string };

/** Dialog de criar/editar apontamento (título + descrição) — mesmo padrão do pdf-viewer. */
export function ApontamentoForm({
  open,
  onOpenChange,
  modo,
  elementosCount,
  valorInicial,
  pending,
  onSalvar,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  modo: "criar" | "editar";
  elementosCount?: number;
  valorInicial?: ApontamentoDraft;
  pending: boolean;
  onSalvar: (draft: ApontamentoDraft) => void;
}) {
  const [titulo, setTitulo] = useState(valorInicial?.titulo ?? "");
  const [texto, setTexto] = useState(valorInicial?.texto ?? "");

  useEffect(() => {
    if (open) {
      setTitulo(valorInicial?.titulo ?? "");
      setTexto(valorInicial?.texto ?? "");
    }
  }, [open, valorInicial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{modo === "criar" ? "Novo apontamento" : "Editar apontamento"}</DialogTitle>
          {modo === "criar" && elementosCount != null && (
            <DialogDescription>
              {elementosCount} elemento(s) selecionado(s) na maquete.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="apontamento-titulo">Título</Label>
            <Input
              id="apontamento-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={200}
              autoFocus
              placeholder="Ex.: Viga cruza duto de climatização"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apontamento-texto">Descrição</Label>
            <textarea
              id="apontamento-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Descreva a interferência ou o ponto de coordenação…"
              maxLength={1000}
              rows={4}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={() => onSalvar({ titulo: titulo.trim(), texto: texto.trim() })}
            disabled={pending || !titulo.trim() || !texto.trim()}
          >
            {modo === "criar" ? "Criar apontamento" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
