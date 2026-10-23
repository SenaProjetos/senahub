"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { criarEapTarefasEmLote } from "@/modules/planejamento/actions";
import { lerTarefasColadas } from "@/modules/planejamento/colar-tarefas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * "Novas tarefas": cola uma lista (uma tarefa por linha, `Nome<TAB>duração` — como vem do Excel) e cria todas de uma vez,
 * abaixo da linha de referência. A prévia usa a MESMA leitura do servidor (`lerTarefasColadas`): o que aparece aqui é o
 * que será criado, e o erro aponta a linha do texto colado.
 */
export function ColarTarefasDialog({
  projetoId,
  depoisDeId,
  depoisDeNome,
  open,
  onOpenChange,
}: {
  projetoId: string;
  /** A linha de referência (a primeira selecionada); `null` = fim da lista. */
  depoisDeId: string | null;
  depoisDeNome: string | null;
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [texto, setTexto] = useState("");
  const leitura = texto.trim() === "" ? null : lerTarefasColadas(texto);

  function criar() {
    if (!leitura?.ok || pending) return;
    start(async () => {
      const r = await criarEapTarefasEmLote({ projetoId, depoisDeId, texto });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.data.criadas === 1 ? "1 tarefa criada." : `${r.data.criadas} tarefas criadas.`);
      setTexto("");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(aberto) => !pending && onOpenChange(aberto)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Novas tarefas</DialogTitle>
          <DialogDescription>
            Cole uma tarefa por linha. Para dar a duração, ponha um TAB e os dias úteis depois do nome (<span className="font-mono">0</span> ou{" "}
            <span className="font-mono">marco</span> cria um marco). {depoisDeNome ? `Entram logo abaixo de "${depoisDeNome}", no mesmo nível.` : "Entram no fim da lista."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="colar-tarefas-texto">Tarefas</Label>
            <textarea
              id="colar-tarefas-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              spellCheck={false}
              placeholder={"Levantamento de campo\t3\nProjeto básico\t10\nEntrega\tmarco"}
              className="w-full rounded-md border bg-transparent px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-describedby="colar-tarefas-ajuda"
              aria-invalid={leitura != null && !leitura.ok}
            />
            <p id="colar-tarefas-ajuda" className="text-xs text-muted-foreground" aria-live="polite">
              {leitura == null ? (
                "Até 200 tarefas de uma vez. Linhas em branco são ignoradas."
              ) : leitura.ok ? (
                `${leitura.tarefas.length === 1 ? "1 tarefa" : `${leitura.tarefas.length} tarefas`} para criar.`
              ) : (
                <span className="text-destructive">{leitura.linha > 0 ? `Linha ${leitura.linha}: ${leitura.erro}` : leitura.erro}</span>
              )}
            </p>
          </div>
          {leitura?.ok && (
            <ul className="max-h-40 divide-y overflow-auto rounded-sm border text-sm" aria-label="Prévia das tarefas">
              {leitura.tarefas.map((t, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                  <span className="min-w-0 truncate">{t.nome}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{t.marco ? "marco" : t.duracaoDias == null ? "1d" : `${String(t.duracaoDias).replace(".", ",")}d`}</span>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={criar} disabled={!leitura?.ok || pending}>
            {pending ? "Criando…" : leitura?.ok ? `Criar ${leitura.tarefas.length === 1 ? "1 tarefa" : `${leitura.tarefas.length} tarefas`}` : "Criar tarefas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
