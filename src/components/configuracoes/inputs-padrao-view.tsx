"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, FileText } from "lucide-react";
import { criarInputTemplate, editarInputTemplate, excluirInputTemplate } from "@/modules/inputs/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";

const GERAL = "__geral";
type Template = { id: string; disciplina: string | null; pergunta: string; ordem: number };

export function InputsPadraoView({ templates, disciplinas }: { templates: Template[]; disciplinas: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ disciplina: GERAL, pergunta: "", ordem: "0" });

  function reset() {
    setEditId(null);
    setForm({ disciplina: GERAL, pergunta: "", ordem: "0" });
  }
  function abrirEdit(t: Template) {
    setEditId(t.id);
    setForm({ disciplina: t.disciplina ?? GERAL, pergunta: t.pergunta, ordem: String(t.ordem) });
  }
  function salvar() {
    if (!form.pergunta.trim()) {
      toast.error("Informe a pergunta.");
      return;
    }
    const payload = {
      disciplina: form.disciplina === GERAL ? "" : form.disciplina,
      pergunta: form.pergunta,
      ordem: Number(form.ordem) || 0,
    };
    start(async () => {
      const r = editId ? await editarInputTemplate({ ...payload, id: editId }) : await criarInputTemplate(payload);
      if (r.ok) {
        toast.success("Template salvo.");
        reset();
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function excluir(id: string) {
    start(async () => {
      const r = await excluirInputTemplate({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  const grupos = new Map<string, Template[]>();
  for (const t of templates) {
    const k = t.disciplina ?? "Geral";
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(t);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Inputs padrão</h2>
        <p className="text-sm text-muted-foreground">
          Perguntas padrão por disciplina, aplicadas automaticamente ao gerar o link de inputs do cliente.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 pt-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Disciplina</Label>
            <Select value={form.disciplina} onValueChange={(v) => setForm({ ...form, disciplina: v ?? GERAL })}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={GERAL}>Geral (todas)</SelectItem>
                {disciplinas.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Pergunta</Label>
            <Input value={form.pergunta} onChange={(e) => setForm({ ...form, pergunta: e.target.value })} placeholder="Ex.: Qual a carga estrutural prevista?" className="min-w-56" />
          </div>
          <div className="w-20 space-y-1.5">
            <Label className="text-xs">Ordem</Label>
            <Input type="number" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} />
          </div>
          <Button size="sm" onClick={salvar} disabled={pending}>
            <Plus className="size-3.5" /> {editId ? "Salvar" : "Adicionar"}
          </Button>
          {editId && <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>}
        </CardContent>
      </Card>

      {templates.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum template cadastrado" />
      ) : (
        <div className="space-y-3">
          {[...grupos.entries()].map(([disc, itens]) => (
            <Card key={disc}>
              <CardContent className="pt-4">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{disc}</p>
                <ul className="divide-y text-sm">
                  {itens.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span><Badge variant="outline" className="mr-2 font-mono text-[10px]">{t.ordem}</Badge>{t.pergunta}</span>
                      <span className="flex shrink-0">
                        <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => abrirEdit(t)}><Pencil className="size-3.5" /></Button>
                        <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir(t.id)} disabled={pending}><Trash2 className="size-3.5" /></Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
