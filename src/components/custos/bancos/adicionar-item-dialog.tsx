"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
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
import { adicionarItem, buscarInsumosParaItem, buscarComposicoesParaItem } from "@/modules/custos/composicoes/actions";

type Opcao = { id: string; codigo: string; descricao: string; unidade: string };

export function AdicionarItemDialog({ composicaoId }: { composicaoId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [tipo, setTipo] = useState<"insumo" | "composicao">("insumo");
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [escolhido, setEscolhido] = useState<Opcao | null>(null);
  const [coeficiente, setCoeficiente] = useState("1");

  function fechar() {
    setOpen(false);
    setBusca("");
    setOpcoes([]);
    setEscolhido(null);
    setCoeficiente("1");
    setTipo("insumo");
  }

  async function buscar() {
    const r = tipo === "insumo" ? await buscarInsumosParaItem({ q: busca }) : await buscarComposicoesParaItem({ q: busca });
    if (r.ok) setOpcoes(r.data.map((o) => ({ id: o.id, codigo: o.codigo, descricao: o.descricao, unidade: o.unidade })));
  }

  function salvar() {
    if (!escolhido) {
      toast.error("Escolha um item na busca.");
      return;
    }
    const coef = Number(coeficiente);
    if (!Number.isFinite(coef) || coef <= 0) {
      toast.error("Coeficiente precisa ser maior que zero.");
      return;
    }
    startTransition(async () => {
      const r = await adicionarItem({
        composicaoId,
        tipo,
        insumoId: tipo === "insumo" ? escolhido.id : undefined,
        composicaoAuxId: tipo === "composicao" ? escolhido.id : undefined,
        coeficiente: coef,
      });
      if (r.ok) {
        toast.success("Item adicionado.");
        fechar();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : fechar())}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Adicionar item
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select
              value={tipo}
              onValueChange={(v) => {
                if (!v) return;
                setTipo(v as "insumo" | "composicao");
                setOpcoes([]);
                setEscolhido(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="insumo">Insumo</SelectItem>
                <SelectItem value="composicao">Composição auxiliar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Buscar {tipo === "insumo" ? "insumo" : "composição"}</Label>
            <div className="flex items-center gap-2">
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} />
              <Button variant="outline" size="icon" onClick={buscar} aria-label="Buscar">
                <Search className="size-4" />
              </Button>
            </div>
          </div>

          {opcoes.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border">
              {opcoes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setEscolhido(o)}
                  className={`block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted ${escolhido?.id === o.id ? "bg-muted" : ""}`}
                >
                  <span className="font-mono">{o.codigo}</span> — {o.descricao}
                </button>
              ))}
            </div>
          )}

          {escolhido && (
            <p className="text-xs text-muted-foreground">
              Selecionado: <span className="font-mono">{escolhido.codigo}</span> — {escolhido.descricao} ({escolhido.unidade})
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="item-coeficiente">Coeficiente</Label>
            <Input
              id="item-coeficiente"
              type="number"
              step="0.000001"
              min={0}
              value={coeficiente}
              onChange={(e) => setCoeficiente(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending || !escolhido}>
            {pending ? "Adicionando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
