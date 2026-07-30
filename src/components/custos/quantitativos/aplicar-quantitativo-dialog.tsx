"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { aplicarQuantitativoAoItem } from "@/modules/custos/quantitativos/actions";

export type ItemParaAplicar = { id: string; codigo: string; descricao: string; unidade: string | null; quantidade: number };
export type QuantitativoParaAplicar = { id: string; descricao: string; quantidade: number; unidade: string; grandeza: string };

export function AplicarQuantitativoDialog({
  itens,
  quantitativo,
  open,
  onOpenChange,
}: {
  itens: ItemParaAplicar[];
  quantitativo: QuantitativoParaAplicar | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [itemId, setItemId] = useState<string>("");

  const item = useMemo(() => itens.find((i) => i.id === itemId) ?? null, [itens, itemId]);
  const unidadeDivergente = item?.unidade != null && item.unidade !== "" && item.unidade !== quantitativo?.unidade;

  function aplicar() {
    if (!quantitativo || !item) return;
    startTransition(async () => {
      const r = await aplicarQuantitativoAoItem({ quantitativoId: quantitativo.id, itemId: item.id });
      if (r.ok) {
        toast.success("Quantidade aplicada ao item.");
        setItemId("");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aplicar levantamento ao item</DialogTitle>
          <DialogDescription className="truncate">{quantitativo?.descricao}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Item do orçamento</Label>
            <Select value={itemId} onValueChange={(v) => v && setItemId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o serviço" />
              </SelectTrigger>
              <SelectContent>
                {itens.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.codigo} — {i.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {item && quantitativo && (
            <div className="space-y-2 rounded-sm border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-center">
                  <p className="text-[11px] text-muted-foreground">Quantidade atual do item</p>
                  <p className="font-mono text-base">
                    {item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.unidade ?? "—"}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-[11px] text-muted-foreground">Nova quantidade (do levantamento)</p>
                  <p className="font-mono text-base font-semibold text-primary">
                    {quantitativo.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {quantitativo.unidade}
                  </p>
                </div>
              </div>
              {unidadeDivergente && (
                <p className="flex items-start gap-1.5 rounded-sm border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Unidade do item ({item.unidade}) é diferente da do levantamento ({quantitativo.unidade}) — confira
                  antes de aplicar.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={aplicar} disabled={!item || pending}>
            Confirmar aplicação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
