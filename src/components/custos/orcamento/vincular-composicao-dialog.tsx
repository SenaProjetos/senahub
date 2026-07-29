"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Link2 } from "lucide-react";
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
import { buscarComposicoesParaVinculo, vincularComposicao } from "@/modules/custos/orcamento/actions";

type Opcao = { id: string; codigo: string; descricao: string; unidade: string };

export function VincularComposicaoDialog({
  itemId,
  itemDescricao,
  open,
  onOpenChange,
}: {
  itemId: string | null;
  itemDescricao: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [escolhida, setEscolhida] = useState<Opcao | null>(null);
  const [buscando, setBuscando] = useState(false);

  function fechar() {
    onOpenChange(false);
    setBusca("");
    setOpcoes([]);
    setEscolhida(null);
  }

  async function buscar() {
    setBuscando(true);
    try {
      const r = await buscarComposicoesParaVinculo({ q: busca });
      if (r.ok) setOpcoes(r.data);
      else toast.error(r.error);
    } finally {
      setBuscando(false);
    }
  }

  function aplicar() {
    if (!itemId || !escolhida) return;
    startTransition(async () => {
      const r = await vincularComposicao({ itemId, composicaoId: escolhida.id });
      if (r.ok) {
        const semPreco = r.data.semPreco.length;
        toast.success(
          semPreco > 0
            ? `Composição vinculada — ${semPreco} insumo(s) sem cotação nesta base (custo parcial).`
            : "Composição vinculada e custo calculado.",
        );
        fechar();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : fechar())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular composição</DialogTitle>
          <DialogDescription>
            O custo unitário de <strong>{itemDescricao}</strong> passa a vir desta composição, calculado
            na base de preço do orçamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="busca-composicao">Buscar por código ou descrição</Label>
            <div className="flex items-center gap-2">
              <Input
                id="busca-composicao"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscar()}
                placeholder="Ex.: 88316 ou alvenaria"
                autoFocus
              />
              <Button variant="outline" size="icon" onClick={buscar} aria-label="Buscar" disabled={buscando}>
                <Search className="size-4" />
              </Button>
            </div>
          </div>

          {opcoes.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border">
              {opcoes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setEscolhida(o)}
                  className={`block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted ${
                    escolhida?.id === o.id ? "bg-muted" : ""
                  }`}
                >
                  <span className="font-mono">{o.codigo}</span> — {o.descricao}
                  <span className="ml-1 text-xs text-muted-foreground">({o.unidade})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={aplicar} disabled={pending || !escolhida}>
            <Link2 className="size-4" /> {pending ? "Vinculando…" : "Vincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
