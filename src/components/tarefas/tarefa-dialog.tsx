"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Archive } from "lucide-react";
import { criarTarefa, editarTarefa, arquivarTarefa, toggleItemTarefa } from "@/modules/tarefas/actions";
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

export type TarefaUI = {
  id: string;
  titulo: string;
  descricao: string;
  statusId: string;
  prazo: string;
  projetoId: string;
  projetoCodigo: string | null;
  responsaveis: { id: string; nome: string }[];
  itens: { id?: string; descricao: string; concluido: boolean }[];
  dependeDeIds: string[];
  bloqueada: boolean;
};

export type OpcoesUI = {
  internos: { id: string; name: string }[];
  projetos: { id: string; codigo: string; nome: string }[];
  tarefas: { id: string; titulo: string }[];
};

const NONE = "__none";

export function TarefaDialog({
  tarefa,
  open,
  onOpenChange,
  opcoes,
  colunas,
}: {
  tarefa: TarefaUI | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  opcoes: OpcoesUI;
  colunas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const vazio = {
    titulo: "",
    descricao: "",
    statusId: colunas[0]?.id ?? "",
    prazo: "",
    projetoId: NONE,
    responsaveisIds: [] as string[],
    itens: [] as { id?: string; descricao: string; concluido: boolean }[],
    dependeDeIds: [] as string[],
  };
  const deTarefa = (t: TarefaUI) => ({
    titulo: t.titulo,
    descricao: t.descricao,
    statusId: t.statusId,
    prazo: t.prazo,
    projetoId: t.projetoId || NONE,
    responsaveisIds: t.responsaveis.map((r) => r.id),
    itens: [...t.itens],
    dependeDeIds: [...t.dependeDeIds],
  });
  const [form, setForm] = useState(tarefa ? deTarefa(tarefa) : vazio);
  const [novoItem, setNovoItem] = useState("");
  const key = tarefa?.id ?? "nova";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setForm(tarefa ? deTarefa(tarefa) : vazio);
    setNovoItem("");
  }

  function toggleArr(campo: "responsaveisIds" | "dependeDeIds", id: string) {
    setForm((f) => ({
      ...f,
      [campo]: f[campo].includes(id) ? f[campo].filter((x) => x !== id) : [...f[campo], id],
    }));
  }

  function toggleChecklist(idx: number) {
    const it = form.itens[idx];
    setForm((f) => ({
      ...f,
      itens: f.itens.map((x, i) => (i === idx ? { ...x, concluido: !x.concluido } : x)),
    }));
    // persiste imediato se item já existe no banco
    if (tarefa && it.id) {
      start(async () => {
        await toggleItemTarefa({ id: it.id!, concluido: !it.concluido });
      });
    }
  }

  function salvar() {
    const payload = {
      titulo: form.titulo,
      descricao: form.descricao,
      statusId: form.statusId,
      prazo: form.prazo,
      projetoId: form.projetoId === NONE ? "" : form.projetoId,
      responsaveisIds: form.responsaveisIds,
      itens: form.itens.map((i) => ({ descricao: i.descricao, concluido: i.concluido })),
      dependeDeIds: form.dependeDeIds,
    };
    start(async () => {
      const r = tarefa ? await editarTarefa({ ...payload, id: tarefa.id }) : await criarTarefa(payload);
      if (r.ok) {
        toast.success(tarefa ? "Tarefa atualizada." : "Tarefa criada.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function arquivar() {
    if (!tarefa) return;
    start(async () => {
      const r = await arquivarTarefa({ id: tarefa.id });
      if (r.ok) {
        toast.success("Tarefa arquivada.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const tarefasDep = opcoes.tarefas.filter((t) => t.id !== tarefa?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tarefa ? tarefa.titulo : "Nova tarefa"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <textarea
              rows={2}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Coluna</Label>
              <Select value={form.statusId} onValueChange={(v) => setForm((f) => ({ ...f, statusId: v ?? f.statusId }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colunas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prazo</Label>
              <Input type="date" value={form.prazo} onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select value={form.projetoId} onValueChange={(v) => setForm((f) => ({ ...f, projetoId: v ?? NONE }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {opcoes.projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.codigo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Responsáveis</Label>
            <div className="flex flex-wrap gap-1.5">
              {opcoes.internos.map((u) => {
                const sel = form.responsaveisIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleArr("responsaveisIds", u.id)}
                    className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                      sel ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {u.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Checklist</Label>
            {form.itens.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="checkbox" checked={it.concluido} onChange={() => toggleChecklist(i)} />
                <span className={`flex-1 text-sm ${it.concluido ? "text-muted-foreground line-through" : ""}`}>
                  {it.descricao}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remover item"
                  onClick={() => setForm((f) => ({ ...f, itens: f.itens.filter((_, idx) => idx !== i) }))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Novo item…"
                value={novoItem}
                onChange={(e) => setNovoItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && novoItem.trim()) {
                    setForm((f) => ({ ...f, itens: [...f.itens, { descricao: novoItem, concluido: false }] }));
                    setNovoItem("");
                  }
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!novoItem.trim()) return;
                  setForm((f) => ({ ...f, itens: [...f.itens, { descricao: novoItem, concluido: false }] }));
                  setNovoItem("");
                }}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>

          {tarefasDep.length > 0 && (
            <div className="space-y-1.5">
              <Label>Depende de</Label>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {tarefasDep.map((t) => {
                  const sel = form.dependeDeIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleArr("dependeDeIds", t.id)}
                      className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                        sel ? "border-warning bg-warning/15 text-warning" : "border-border text-muted-foreground hover:border-warning/50"
                      }`}
                    >
                      {t.titulo}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {tarefa ? (
            <Button variant="ghost" size="sm" onClick={arquivar} disabled={pending}>
              <Archive className="size-3.5" /> Arquivar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pending || !form.titulo}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
