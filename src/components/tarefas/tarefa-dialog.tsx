"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Archive, Paperclip, Send, FileText, X } from "lucide-react";
import { formatarCodigo } from "@/modules/projetos/numbering";
import {
  criarTarefa,
  editarTarefa,
  arquivarTarefa,
  toggleItemTarefa,
  comentarTarefa,
  removerComentario,
} from "@/modules/tarefas/actions";
import { PRIORIDADES, PRIORIDADE_LABEL, type Prioridade } from "@/modules/tarefas/prioridade";
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
  prioridade: string;
  projetoId: string;
  projetoCodigo: string | null;
  projetoNome: string | null;
  criadorId: string;
  responsaveis: { id: string; nome: string }[];
  itens: { id?: string; descricao: string; concluido: boolean }[];
  dependeDeIds: string[];
  bloqueada: boolean;
  comentarios?: { id: string; texto: string; autor: string; data: string; anexoMime: string | null; anexoNome: string | null }[];
};

export type OpcoesUI = {
  internos: { id: string; name: string }[];
  projetos: { id: string; codigo: string; nome: string }[];
  tarefas: { id: string; titulo: string }[];
};

const NONE = "__none";

/** Data local → "YYYY-MM-DD" (sem deslocamento de fuso). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const PRESETS_PRAZO: { label: string; calc: () => string }[] = [
  { label: "Hoje", calc: () => ymd(new Date()) },
  { label: "Amanhã", calc: () => { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); } },
  { label: "+7 dias", calc: () => { const d = new Date(); d.setDate(d.getDate() + 7); return ymd(d); } },
  { label: "Fim do mês", calc: () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); } },
];

export function TarefaDialog({
  tarefa,
  open,
  onOpenChange,
  opcoes,
  colunas,
  meId,
  meRole,
}: {
  tarefa: TarefaUI | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  opcoes: OpcoesUI;
  colunas: { id: string; nome: string }[];
  meId: string;
  meRole: string;
}) {
  // Item 27 (beta): só quem criou a tarefa (ou admin/supervisor) edita/arquiva. Tarefa nova
  // (tarefa === null) é sempre editável — quem cria ainda não tem criadorId atribuído.
  const podeEditar =
    !tarefa || tarefa.criadorId === meId || meRole === "admin" || meRole === "supervisor";
  const router = useRouter();
  const [pending, start] = useTransition();
  const vazio = {
    titulo: "",
    descricao: "",
    statusId: colunas[0]?.id ?? "",
    prazo: "",
    prioridade: "",
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
    prioridade: t.prioridade,
    projetoId: t.projetoId || NONE,
    responsaveisIds: t.responsaveis.map((r) => r.id),
    itens: [...t.itens],
    dependeDeIds: [...t.dependeDeIds],
  });
  const [form, setForm] = useState(tarefa ? deTarefa(tarefa) : vazio);
  const [novoItem, setNovoItem] = useState("");
  const [comentarios, setComentarios] = useState(tarefa?.comentarios ?? []);
  const [novoComent, setNovoComent] = useState("");
  const [comentFile, setComentFile] = useState<File | null>(null);
  const comentFileRef = useRef<HTMLInputElement>(null);
  const key = tarefa?.id ?? "nova";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setForm(tarefa ? deTarefa(tarefa) : vazio);
    setNovoItem("");
    setComentarios(tarefa?.comentarios ?? []);
    setNovoComent("");
    setComentFile(null);
  }

  function enviarComentario() {
    if (!tarefa || (!novoComent.trim() && !comentFile)) return;
    const texto = novoComent;
    const arquivo = comentFile;
    setNovoComent("");
    setComentFile(null);
    start(async () => {
      let meta: { anexoPath?: string; anexoNome?: string; anexoMime?: string } = {};
      if (arquivo) {
        const fd = new FormData();
        fd.append("file", arquivo);
        const res = await fetch("/api/tarefas/anexo", { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(j.error ?? "Falha no anexo.");
          return;
        }
        meta = j;
      }
      const r = await comentarTarefa({ tarefaId: tarefa.id, texto, ...meta });
      if (r.ok) {
        setComentarios((cs) => [
          ...cs,
          { id: r.data.id, texto, autor: "Você", data: new Date().toISOString(), anexoMime: meta.anexoMime ?? null, anexoNome: meta.anexoNome ?? null },
        ]);
      } else toast.error(r.error);
    });
  }
  function excluirComentario(id: string) {
    start(async () => {
      const r = await removerComentario({ id });
      if (r.ok) setComentarios((cs) => cs.filter((c) => c.id !== id));
      else toast.error(r.error);
    });
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
      prioridade: (form.prioridade || "") as Prioridade | "",
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
          {!podeEditar && (
            <p className="rounded-sm border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning-foreground">
              Só quem criou esta tarefa (ou admin/supervisor) pode editá-la.
            </p>
          )}
          <fieldset disabled={!podeEditar} className="contents">
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
                      {formatarCodigo(p.codigo)} — {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select
                value={form.prioridade || NONE}
                onValueChange={(v) => setForm((f) => ({ ...f, prioridade: v === NONE ? "" : (v ?? "") }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORIDADE_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Atalhos de prazo</Label>
              <div className="flex flex-wrap gap-1">
                {PRESETS_PRAZO.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setForm((f) => ({ ...f, prazo: p.calc() }))}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
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
          </fieldset>

          {tarefa && (
            <div className="space-y-1.5 border-t pt-3">
              <Label>Comentários</Label>
              {comentarios.length > 0 && (
                <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                  {comentarios.map((c) => (
                    <li key={c.id} className="rounded-sm bg-muted/50 px-2 py-1 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[11px] font-semibold text-muted-foreground">{c.autor}</span>
                        <button type="button" onClick={() => excluirComentario(c.id)} aria-label="Remover" className="text-muted-foreground hover:text-foreground">
                          <X className="size-3" />
                        </button>
                      </div>
                      {c.texto && <p className="whitespace-pre-wrap break-words">{c.texto}</p>}
                      {c.anexoMime && (
                        <a href={`/api/tarefas/anexo/${c.id}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <FileText className="size-3" /> {c.anexoNome ?? "anexo"}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {comentFile && (
                <div className="flex items-center gap-2 rounded-sm border bg-muted/40 px-2 py-1 text-xs">
                  <Paperclip className="size-3 shrink-0" />
                  <span className="flex-1 truncate">{comentFile.name}</span>
                  <button type="button" onClick={() => setComentFile(null)} aria-label="Remover anexo">
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input ref={comentFileRef} type="file" hidden onChange={(e) => { setComentFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                <Button size="icon" variant="ghost" type="button" onClick={() => comentFileRef.current?.click()} aria-label="Anexar">
                  <Paperclip className="size-4" />
                </Button>
                <Input
                  value={novoComent}
                  onChange={(e) => setNovoComent(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), enviarComentario())}
                  placeholder="Comentar…"
                />
                <Button size="icon" type="button" onClick={enviarComentario} disabled={pending} aria-label="Enviar">
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {tarefa && podeEditar ? (
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
            <Button onClick={salvar} disabled={pending || !form.titulo || !podeEditar}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
