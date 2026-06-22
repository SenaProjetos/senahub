"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  criarEapTarefa,
  editarEapTarefa,
  excluirEapTarefa,
  vincularDependencia,
  removerDependencia,
} from "@/modules/planejamento/actions";
import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

const NONE = "__none";

export function EapDialog({
  tarefa,
  open,
  onOpenChange,
  projetoId,
  disciplinas,
  tarefas,
}: {
  tarefa: EapTarefaDTO | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projetoId: string;
  disciplinas: { id: string; nome: string }[];
  tarefas: EapTarefaDTO[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const hoje = new Date().toISOString().slice(0, 10);
  const vazio = {
    nome: "",
    parentId: NONE,
    disciplinaId: NONE,
    inicioPrevisto: hoje,
    fimPrevisto: hoje,
    progresso: 0,
    marco: false,
  };
  const de = (t: EapTarefaDTO) => ({
    nome: t.nome,
    parentId: t.parentId ?? NONE,
    disciplinaId: t.disciplinaId ?? NONE,
    inicioPrevisto: t.inicioPrevisto,
    fimPrevisto: t.fimPrevisto,
    progresso: t.progresso,
    marco: t.marco,
  });
  const [form, setForm] = useState(tarefa ? de(tarefa) : vazio);
  const key = tarefa?.id ?? "nova";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setForm(tarefa ? de(tarefa) : vazio);
  }

  function salvar() {
    if (!form.nome.trim()) return;
    start(async () => {
      const r = tarefa
        ? await editarEapTarefa({
            id: tarefa.id,
            nome: form.nome,
            disciplinaId: form.disciplinaId === NONE ? "" : form.disciplinaId,
            inicioPrevisto: form.inicioPrevisto,
            fimPrevisto: form.marco ? form.inicioPrevisto : form.fimPrevisto,
            progresso: Number(form.progresso),
            marco: form.marco,
          })
        : await criarEapTarefa({
            projetoId,
            parentId: form.parentId === NONE ? "" : form.parentId,
            disciplinaId: form.disciplinaId === NONE ? "" : form.disciplinaId,
            nome: form.nome,
            inicioPrevisto: form.inicioPrevisto,
            fimPrevisto: form.marco ? form.inicioPrevisto : form.fimPrevisto,
            progresso: Number(form.progresso),
            marco: form.marco,
          });
      if (r.ok) {
        toast.success(tarefa ? "Tarefa atualizada." : "Tarefa criada.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function excluir() {
    if (!tarefa) return;
    start(async () => {
      const r = await excluirEapTarefa({ id: tarefa.id });
      if (r.ok) {
        toast.success("Tarefa excluída.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function toggleDep(predecessoraId: string) {
    if (!tarefa) return;
    const tem = tarefa.predecessoraIds.includes(predecessoraId);
    start(async () => {
      const r = tem
        ? await removerDependencia({ tarefaId: tarefa.id, predecessoraId })
        : await vincularDependencia({ tarefaId: tarefa.id, predecessoraId });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  const outras = tarefas.filter((t) => t.id !== tarefa?.id);
  const possiveisPais = outras;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tarefa ? tarefa.nome : "Nova tarefa da EAP"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="marco"
              checked={form.marco}
              onCheckedChange={(v) => setForm((f) => ({ ...f, marco: v === true }))}
            />
            <Label htmlFor="marco" className="cursor-pointer font-normal">
              Marco (milestone — data pontual, sem duração)
            </Label>
          </div>

          <div className={`grid gap-3 ${form.marco ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="space-y-1.5">
              <Label>{form.marco ? "Data do marco" : "Início previsto"}</Label>
              <Input
                type="date"
                value={form.inicioPrevisto}
                onChange={(e) => setForm((f) => ({ ...f, inicioPrevisto: e.target.value }))}
              />
            </div>
            {!form.marco && (
              <div className="space-y-1.5">
                <Label>Fim previsto</Label>
                <Input
                  type="date"
                  value={form.fimPrevisto}
                  onChange={(e) => setForm((f) => ({ ...f, fimPrevisto: e.target.value }))}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Disciplina (opcional)</Label>
              <Select
                value={form.disciplinaId}
                onValueChange={(v) => setForm((f) => ({ ...f, disciplinaId: v ?? NONE }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {disciplinas.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!form.marco && (
              <div className="space-y-1.5">
                <Label>Progresso: {form.progresso}%</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={form.progresso}
                  onChange={(e) => setForm((f) => ({ ...f, progresso: Number(e.target.value) }))}
                  className="w-full accent-primary"
                />
              </div>
            )}
          </div>

          {!tarefa && possiveisPais.length > 0 && (
            <div className="space-y-1.5">
              <Label>Subtarefa de (opcional)</Label>
              <Select
                value={form.parentId}
                onValueChange={(v) => setForm((f) => ({ ...f, parentId: v ?? NONE }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— (tarefa de topo)</SelectItem>
                  {possiveisPais.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {tarefa && outras.length > 0 && (
            <div className="space-y-1.5">
              <Label>Depende de (predecessoras)</Label>
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {outras.map((t) => {
                  const sel = tarefa.predecessoraIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={pending}
                      onClick={() => toggleDep(t.id)}
                      className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                        sel
                          ? "border-warning bg-warning/15 text-warning"
                          : "border-border text-muted-foreground hover:border-warning/50"
                      }`}
                    >
                      {t.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {tarefa ? (
            <Button variant="ghost" size="sm" onClick={excluir} disabled={pending}>
              <Trash2 className="size-3.5" /> Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pending || !form.nome.trim()}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
