"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListPlus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { criarListaDocumentos, excluirListaDocumentos, renomearListaDocumentos } from "@/modules/uploads/listas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useSetParams } from "@/lib/use-set-param";
import { cn } from "@/lib/utils";

export type ListaPainel = { id: string; nome: string; totalDocumentosVisiveis: number; criadoPor: string };

type Edicao = { modo: "criar" } | { modo: "renomear"; lista: ListaPainel } | null;

/** Aba compartilhada de listas lógicas do projeto (F2-PR7). */
export function PainelListas({
  projetoId,
  listas,
  selecionadaId,
  podeGerir,
}: {
  projetoId: string;
  listas: ListaPainel[];
  selecionadaId: string | null;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const setParams = useSetParams();
  const confirm = useConfirm();
  const [edicao, setEdicao] = useState<Edicao>(null);
  const [nome, setNome] = useState("");
  const [pendente, start] = useTransition();

  function abrirCriar() {
    setNome("");
    setEdicao({ modo: "criar" });
  }

  function abrirRenomear(lista: ListaPainel) {
    setNome(lista.nome);
    setEdicao({ modo: "renomear", lista });
  }

  function salvar() {
    if (!edicao) return;
    start(async () => {
      const resultado = edicao.modo === "criar"
        ? await criarListaDocumentos({ projetoId, nome })
        : await renomearListaDocumentos({ listaId: edicao.lista.id, nome });
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success(edicao.modo === "criar" ? "Lista criada." : "Lista renomeada.");
      setEdicao(null);
      router.refresh();
    });
  }

  async function excluir(lista: ListaPainel) {
    const confirmou = await confirm({
      title: `Excluir a lista “${lista.nome}”?`,
      description: "Os documentos continuam no projeto; apenas os vínculos desta lista serão removidos.",
      confirmLabel: "Excluir lista",
      variant: "destructive",
    });
    if (!confirmou) return;
    start(async () => {
      const resultado = await excluirListaDocumentos({ listaId: lista.id });
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      if (selecionadaId === lista.id) setParams({ listaId: null });
      toast.success("Lista excluída.");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <h3 className="text-sm font-semibold">Listas</h3>
        {podeGerir && (
          <Button size="icon-sm" variant="ghost" onClick={abrirCriar} title="Criar lista" aria-label="Criar lista">
            <ListPlus className="size-4" />
          </Button>
        )}
      </div>

      <ul className="space-y-0.5 p-2" role="list">
        {listas.map((lista) => (
          <li key={lista.id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => setParams({ listaId: lista.id, disciplinaId: null })}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                selecionadaId === lista.id ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/60",
              )}
            >
              <span className="min-w-0 truncate">{lista.nome}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{lista.totalDocumentosVisiveis}</span>
            </button>
            {podeGerir && (
              <span className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <Button size="icon-sm" variant="ghost" onClick={() => abrirRenomear(lista)} title={`Renomear ${lista.nome}`} aria-label={`Renomear ${lista.nome}`}>
                  <Pencil className="size-3" />
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => void excluir(lista)} title={`Excluir ${lista.nome}`} aria-label={`Excluir ${lista.nome}`}>
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </span>
            )}
          </li>
        ))}
        {listas.length === 0 && (
          <li className="px-2 py-4 text-center text-xs text-muted-foreground">
            Nenhuma lista criada neste projeto.
          </li>
        )}
      </ul>

      <Dialog open={edicao !== null} onOpenChange={(aberto) => !aberto && setEdicao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edicao?.modo === "renomear" ? "Renomear lista" : "Criar lista"}</DialogTitle>
            <DialogDescription>Uma lista reúne documentos sem duplicar arquivos ou alterar pastas.</DialogDescription>
          </DialogHeader>
          <Input value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Ex.: Entrega 03" maxLength={100} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdicao(null)} disabled={pendente}>Cancelar</Button>
            <Button onClick={salvar} disabled={pendente || !nome.trim()}>{pendente ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
