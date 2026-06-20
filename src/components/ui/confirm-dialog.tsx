"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
};

type Estado = ConfirmOptions & { open: boolean };

const ConfirmContext = React.createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = React.useState<Estado>({ open: false, title: "" });
  const resolveRef = React.useRef<((v: boolean) => void) | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    setEstado({ ...opts, open: true });
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const fechar = React.useCallback((resultado: boolean) => {
    setEstado((e) => ({ ...e, open: false }));
    resolveRef.current?.(resultado);
    resolveRef.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={estado.open}
        onOpenChange={(open) => {
          if (!open) fechar(false);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{estado.title}</DialogTitle>
            {estado.description ? <DialogDescription>{estado.description}</DialogDescription> : null}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => fechar(false)}>
              {estado.cancelLabel ?? "Cancelar"}
            </Button>
            <Button
              variant={estado.variant === "destructive" ? "destructive" : "default"}
              onClick={() => fechar(true)}
            >
              {estado.confirmLabel ?? "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** Retorna `confirm(opts) => Promise<boolean>`. Requer <ConfirmProvider> ancestral. */
export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm precisa de <ConfirmProvider> no topo da árvore.");
  return ctx;
}
