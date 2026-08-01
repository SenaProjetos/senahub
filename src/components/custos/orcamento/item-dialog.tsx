"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { criarItem, editarItem } from "@/modules/custos/orcamento/actions";
import type { ItemArvore } from "@/modules/custos/orcamento/queries";

// "criar" só cria grupo — serviço novo nasce vinculado (composição ou insumo), via o dialog de busca
// (novo-item-dialog.tsx). Este dialog segue cuidando de editar qualquer serviço já existente.
export type AlvoItem =
  | { modo: "criar"; tipo: "grupo"; parentId: string | null; parentDescricao: string | null }
  | { modo: "editar"; item: ItemArvore };

export function ItemDialog({
  orcamentoId,
  alvo,
  open,
  onOpenChange,
}: {
  orcamentoId: string;
  alvo: AlvoItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [descricao, setDescricao] = useState("");
  const [unidade, setUnidade] = useState("");
  const [quantidade, setQuantidade] = useState("0");
  const [custoUnitario, setCustoUnitario] = useState("0");

  useEffect(() => {
    if (!open || !alvo) return;
    if (alvo.modo === "editar") {
      setDescricao(alvo.item.descricao);
      setUnidade(alvo.item.unidade ?? "");
      setQuantidade(String(alvo.item.quantidade));
      setCustoUnitario(String(alvo.item.custoUnitario));
    } else {
      setDescricao("");
      setUnidade("");
      setQuantidade("0");
      setCustoUnitario("0");
    }
  }, [open, alvo]);

  if (!alvo) return null;

  const ehServico = alvo.modo === "editar" && alvo.item.tipo === "servico";
  const travado = alvo.modo === "editar" && alvo.item.bloqueado;
  const vinculado = alvo.modo === "editar" && (alvo.item.composicaoId !== null || alvo.item.insumoId !== null);

  function salvar() {
    if (!descricao.trim()) {
      toast.error("Descrição é obrigatória.");
      return;
    }
    startTransition(async () => {
      const r =
        alvo!.modo === "criar"
          ? await criarItem({
              orcamentoId,
              parentId: alvo!.parentId,
              tipo: "grupo",
              descricao: descricao.trim(),
              unidade: unidade.trim(),
            })
          : await editarItem({
              id: alvo!.item.id,
              descricao: descricao.trim(),
              unidade: unidade.trim() || null,
              ...(ehServico ? { quantidade: Number(quantidade) } : {}),
              // Custo só vai quando não há composição vinculada nem trava (senão o service recusa).
              ...(ehServico && !vinculado && !travado ? { custoUnitario: Number(custoUnitario) } : {}),
            });

      if (r.ok) {
        toast.success(alvo!.modo === "criar" ? "Item criado." : "Item atualizado.");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const titulo = alvo.modo === "criar" ? "Novo grupo" : `Editar ${alvo.item.tipo === "grupo" ? "grupo" : "serviço"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {alvo.modo === "criar" && alvo.parentDescricao && (
            <DialogDescription>Dentro de: {alvo.parentDescricao}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="item-descricao">Descrição</Label>
            <Input
              id="item-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              autoFocus
            />
          </div>

          {ehServico && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="item-unidade">Unidade</Label>
                  <Input
                    id="item-unidade"
                    value={unidade}
                    onChange={(e) => setUnidade(e.target.value)}
                    placeholder="M2"
                    disabled={vinculado}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="item-quantidade">Quantidade</Label>
                  <Input
                    id="item-quantidade"
                    type="number"
                    step="0.01"
                    min={0}
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="item-custo">Custo unitário (R$)</Label>
                <Input
                  id="item-custo"
                  type="number"
                  step="0.01"
                  min={0}
                  value={custoUnitario}
                  onChange={(e) => setCustoUnitario(e.target.value)}
                  disabled={vinculado || travado}
                />
                {vinculado && (
                  <p className="text-xs text-muted-foreground">
                    Custo vem da composição vinculada. Desvincule para digitar à mão.
                  </p>
                )}
                {travado && !vinculado && (
                  <p className="text-xs text-muted-foreground">Item travado — destrave para alterar o custo.</p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
