"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { criarRfq } from "@/modules/custos/cotacoes/actions";
import { buscarInsumosParaItem } from "@/modules/custos/composicoes/actions";

type InsumoOpcao = { id: string; codigo: string; descricao: string; unidade: string };
type ItemForm = { tempId: string; insumoId?: string; descricao: string; quantidade: string; unidade: string };

function novoItem(): ItemForm {
  return { tempId: crypto.randomUUID(), descricao: "", quantidade: "1", unidade: "" };
}

export function NovaRfqDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prazoResposta, setPrazoResposta] = useState("");
  const [itens, setItens] = useState<ItemForm[]>([novoItem()]);
  const [buscaAberta, setBuscaAberta] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<InsumoOpcao[]>([]);

  function fechar() {
    setOpen(false);
    setTitulo("");
    setDescricao("");
    setPrazoResposta("");
    setItens([novoItem()]);
    setBuscaAberta(null);
    setBusca("");
    setOpcoes([]);
  }

  function atualizarItem(tempId: string, patch: Partial<ItemForm>) {
    setItens((its) => its.map((i) => (i.tempId === tempId ? { ...i, ...patch } : i)));
  }

  async function buscarInsumo() {
    const r = await buscarInsumosParaItem({ q: busca });
    if (r.ok) setOpcoes(r.data.map((o) => ({ id: o.id, codigo: o.codigo, descricao: o.descricao, unidade: o.unidade })));
  }

  function escolherInsumo(tempId: string, o: InsumoOpcao) {
    atualizarItem(tempId, { insumoId: o.id, descricao: `${o.codigo} — ${o.descricao}`, unidade: o.unidade });
    setBuscaAberta(null);
    setBusca("");
    setOpcoes([]);
  }

  function salvar() {
    if (!titulo.trim()) {
      toast.error("Informe o título.");
      return;
    }
    const itensValidos = itens.filter((i) => i.descricao.trim() && i.unidade.trim() && Number(i.quantidade) > 0);
    if (itensValidos.length === 0) {
      toast.error("Informe ao menos um item com descrição, quantidade e unidade.");
      return;
    }
    startTransition(async () => {
      const r = await criarRfq({
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        prazoResposta: prazoResposta || undefined,
        itens: itensValidos.map((i) => ({
          insumoId: i.insumoId,
          descricao: i.descricao.trim(),
          quantidade: Number(i.quantidade),
          unidade: i.unidade.trim(),
        })),
      });
      if (r.ok) {
        toast.success("RFQ criada.");
        fechar();
        router.push(`/custos/cotacoes/${r.data.id}`);
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : fechar())}>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Nova RFQ
      </Button>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova solicitação de cotação</DialogTitle>
          <DialogDescription>Convide fornecedores depois de criar, na tela de detalhe.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rfq-titulo">Título</Label>
            <Input id="rfq-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Fornecimento de concreto usinado" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rfq-descricao">Descrição</Label>
              <Input id="rfq-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rfq-prazo">Prazo de resposta</Label>
              <Input id="rfq-prazo" type="date" value={prazoResposta} onChange={(e) => setPrazoResposta(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2 border-t pt-3">
            <Label>Itens a cotar</Label>
            {itens.map((item) => (
              <div key={item.tempId} className="space-y-1.5 rounded-sm border p-2">
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    placeholder="Descrição"
                    value={item.descricao}
                    onChange={(e) => atualizarItem(item.tempId, { descricao: e.target.value, insumoId: undefined })}
                    className="min-w-40 flex-1"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Qtd."
                    value={item.quantidade}
                    onChange={(e) => atualizarItem(item.tempId, { quantidade: e.target.value })}
                    className="w-24"
                  />
                  <Input
                    placeholder="Unid."
                    value={item.unidade}
                    onChange={(e) => atualizarItem(item.tempId, { unidade: e.target.value })}
                    className="w-20"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Buscar no catálogo de insumos"
                    onClick={() => {
                      setBuscaAberta(buscaAberta === item.tempId ? null : item.tempId);
                      setBusca("");
                      setOpcoes([]);
                    }}
                  >
                    <Search className="size-4" />
                  </Button>
                  {itens.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Remover item"
                      onClick={() => setItens((its) => its.filter((i) => i.tempId !== item.tempId))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                {item.insumoId && <p className="text-[11px] text-muted-foreground">Vinculado ao banco de insumos.</p>}
                {buscaAberta === item.tempId && (
                  <div className="space-y-1.5 rounded-sm border bg-muted/30 p-2">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Buscar insumo…"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && buscarInsumo()}
                        className="h-8"
                      />
                      <Button type="button" size="sm" variant="outline" onClick={buscarInsumo}>
                        Buscar
                      </Button>
                    </div>
                    {opcoes.length > 0 && (
                      <div className="max-h-32 overflow-y-auto rounded-sm border bg-background">
                        {opcoes.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => escolherInsumo(item.tempId, o)}
                            className="block w-full border-b px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted"
                          >
                            <span className="font-mono">{o.codigo}</span> — {o.descricao} ({o.unidade})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setItens((its) => [...its, novoItem()])}>
              <Plus className="size-3.5" /> Item
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Criando…" : "Criar RFQ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
