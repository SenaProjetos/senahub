"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { registrarQuantitativo } from "@/modules/custos/quantitativos/actions";
import type { CustoGrandeza } from "@/modules/custos/quantitativos/quantidades-ifc";

const GRANDEZA_LABEL: Record<CustoGrandeza, string> = {
  area: "Área",
  volume: "Volume",
  comprimento: "Comprimento",
  contagem: "Contagem",
  peso: "Peso",
};

export function ManualQuantitativoDialog({
  orcamentoId,
  open,
  onOpenChange,
}: {
  orcamentoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [descricao, setDescricao] = useState("");
  const [grandeza, setGrandeza] = useState<CustoGrandeza>("area");
  const [unidade, setUnidade] = useState("m²");
  const [quantidade, setQuantidade] = useState("");
  const [memoria, setMemoria] = useState("");

  function limpar() {
    setDescricao("");
    setQuantidade("");
    setMemoria("");
  }

  function salvar() {
    const valor = Number(quantidade.replace(",", "."));
    if (!descricao.trim() || !unidade.trim() || !Number.isFinite(valor) || valor < 0) return;
    startTransition(async () => {
      const r = await registrarQuantitativo({
        orcamentoId,
        descricao: descricao.trim(),
        grandeza,
        unidade: unidade.trim(),
        quantidade: valor,
        origem: "manual",
        memoria: memoria.trim() || undefined,
      });
      if (r.ok) {
        toast.success("Levantamento gravado.");
        limpar();
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Levantamento manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="manual-descricao">Descrição</Label>
            <Input id="manual-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Grandeza</Label>
              <Select value={grandeza} onValueChange={(v) => v && setGrandeza(v as CustoGrandeza)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(GRANDEZA_LABEL) as CustoGrandeza[]).map((g) => (
                    <SelectItem key={g} value={g}>
                      {GRANDEZA_LABEL[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-unidade">Unidade</Label>
              <Input id="manual-unidade" value={unidade} onChange={(e) => setUnidade(e.target.value)} maxLength={10} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-quantidade">Quantidade</Label>
            <Input
              id="manual-quantidade"
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-memoria">Memória de cálculo (opcional)</Label>
            <textarea
              id="manual-memoria"
              value={memoria}
              onChange={(e) => setMemoria(e.target.value)}
              rows={3}
              maxLength={1000}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending || !descricao.trim() || !quantidade.trim()}>
            Gravar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
