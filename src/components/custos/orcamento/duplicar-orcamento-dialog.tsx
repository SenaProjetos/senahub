"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { duplicarOrcamento } from "@/modules/custos/orcamento/actions";

export function DuplicarOrcamentoDialog({
  orcamentoId,
  tituloAtual,
}: {
  orcamentoId: string;
  tituloAtual: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState(`${tituloAtual} (cópia)`);
  const [pending, startTransition] = useTransition();

  function duplicar() {
    if (!titulo.trim()) {
      toast.error("Informe o título da cópia.");
      return;
    }
    startTransition(async () => {
      const r = await duplicarOrcamento({ orcamentoId, titulo: titulo.trim() });
      if (r.ok) {
        toast.success("Orçamento duplicado.");
        setOpen(false);
        router.push(`/custos/${r.data.id}`);
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Copy className="size-4" /> Duplicar
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicar orçamento como modelo</DialogTitle>
          <DialogDescription>
            Copia cabeçalho, BDI, encargos e a árvore inteira de itens. O original não é alterado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="dup-titulo">Título da cópia</Label>
          <Input id="dup-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={duplicar} disabled={pending}>
            {pending ? "Duplicando…" : "Duplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
