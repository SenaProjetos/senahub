"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buscarFornecedoresConvite, convidarFornecedores } from "@/modules/custos/cotacoes/actions";
import type { FornecedorParaConvite } from "@/modules/custos/cotacoes/queries";

export function ConvidarFornecedoresDialog({ rfqId }: { rfqId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<FornecedorParaConvite[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  async function buscar(q: string) {
    const r = await buscarFornecedoresConvite({ rfqId, q: q || undefined });
    if (r.ok) setOpcoes(r.data);
  }

  // Carrega a lista completa ao abrir; busca por texto só dispara no Enter/botão (não por tecla).
  useEffect(() => {
    if (open) buscar("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function fechar() {
    setOpen(false);
    setBusca("");
    setOpcoes([]);
    setSelecionados(new Set());
  }

  function alternar(id: string) {
    setSelecionados((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function convidar() {
    if (selecionados.size === 0) {
      toast.error("Escolha ao menos um fornecedor.");
      return;
    }
    startTransition(async () => {
      const r = await convidarFornecedores({ rfqId, fornecedorIds: [...selecionados] });
      if (r.ok) {
        toast.success("Fornecedor(es) convidado(s).");
        fechar();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : fechar())}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" /> Convidar fornecedores
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar fornecedores</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar fornecedor…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscar(busca)}
            />
            <Button variant="outline" size="icon" aria-label="Buscar" onClick={() => buscar(busca)}>
              <Search className="size-4" />
            </Button>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-sm border">
            {opcoes.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nenhum fornecedor ativo encontrado.</p>
            ) : (
              opcoes.map((f) => (
                <label key={f.id} className={`flex items-center gap-2 border-b p-2 text-sm last:border-b-0 ${f.jaConvidado ? "opacity-50" : ""}`}>
                  <Checkbox
                    checked={f.jaConvidado || selecionados.has(f.id)}
                    disabled={f.jaConvidado}
                    onCheckedChange={() => alternar(f.id)}
                  />
                  <span className="min-w-0 flex-1">
                    {f.nome}
                    {f.jaConvidado && <span className="ml-1 text-xs text-muted-foreground">(já convidado)</span>}
                  </span>
                  {f.avaliacaoNota != null && <span className="text-xs text-muted-foreground">{f.avaliacaoNota.toFixed(1)}/5</span>}
                </label>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={convidar} disabled={pending || selecionados.size === 0}>
            {pending ? "Convidando…" : `Convidar (${selecionados.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
