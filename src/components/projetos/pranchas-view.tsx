"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, Trash2, Layers, FileStack } from "lucide-react";
import { criarPrancha, editarPrancha, excluirPrancha } from "@/modules/projetos/pranchas/actions";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Prancha = { id: string; codigo: string; titulo: string; revisao: string | null; escala: string | null };
type Disciplina = { id: string; nome: string; pranchas: Prancha[] };

export function PranchasView({
  projeto,
  disciplinas,
  podeGerir,
}: {
  projeto: { id: string; codigo: string; nome: string };
  disciplinas: Disciplina[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dlg, setDlg] = useState<{ disciplinaId: string; p: Prancha | null } | null>(null);
  const [form, setForm] = useState({ codigo: "", titulo: "", revisao: "", escala: "" });

  function sugerirCodigo(d: Disciplina): string {
    const abr = d.nome.slice(0, 3).toUpperCase().replace(/\s/g, "");
    const n = d.pranchas.length + 1;
    return `${projeto.codigo}-${abr}-${n.toString().padStart(2, "0")}`;
  }

  function abrir(disciplinaId: string, p: Prancha | null) {
    if (!podeGerir) return;
    const d = disciplinas.find((x) => x.id === disciplinaId);
    const codigoDefault = p ? p.codigo : d ? sugerirCodigo(d) : "";
    setForm({ codigo: codigoDefault, titulo: p?.titulo ?? "", revisao: p?.revisao ?? "", escala: p?.escala ?? "" });
    setDlg({ disciplinaId, p });
  }
  function salvar() {
    if (!dlg || !form.codigo.trim() || !form.titulo.trim()) return;
    start(async () => {
      const r = dlg.p
        ? await editarPrancha({ id: dlg.p.id, disciplinaId: dlg.disciplinaId, ...form })
        : await criarPrancha({ disciplinaId: dlg.disciplinaId, ...form });
      if (r.ok) {
        toast.success("Prancha salva.");
        setDlg(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function excluir(id: string) {
    start(async () => {
      const r = await excluirPrancha({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/projetos/${projeto.id}`} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> {formatarCodigo(projeto.codigo)} · {projeto.nome}
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Pranchas</h2>
        <p className="text-sm text-muted-foreground">Folhas técnicas por disciplina.</p>
      </div>

      {disciplinas.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={Layers} title="Nenhuma disciplina" />
          </CardContent>
        </Card>
      ) : (
        disciplinas.map((d) => (
          <Card key={d.id}>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{d.nome}</CardTitle>
              {podeGerir && (
                <Button size="sm" variant="outline" onClick={() => abrir(d.id, null)}>
                  <Plus className="size-3.5" /> Prancha
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {d.pranchas.length === 0 ? (
                <EmptyState
                  icon={FileStack}
                  title="Sem pranchas"
                  description="Folhas técnicas (plantas) da disciplina por escala e revisão."
                />
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Código</th>
                      <th className="px-4 py-2">Título</th>
                      <th className="px-4 py-2">Rev.</th>
                      <th className="px-4 py-2">Escala</th>
                      {podeGerir && <th className="px-4 py-2 text-right">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {d.pranchas.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/40">
                        <td className="px-4 py-2 font-mono text-xs text-primary">{p.codigo}</td>
                        <td className="px-4 py-2">{p.titulo}</td>
                        <td className="px-4 py-2 font-mono text-xs">{p.revisao ?? "—"}</td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.escala ?? "—"}</td>
                        {podeGerir && (
                          <td className="px-4 py-2 text-right">
                            <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => abrir(d.id, p)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir(p.id)} disabled={pending}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dlg?.p ? "Editar prancha" : "Nova prancha"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Código <span className="text-muted-foreground">(opcional — auto)</span></Label>
              <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="001 (gerado automaticamente)" />
            </div>
            <div className="space-y-1.5">
              <Label>Revisão</Label>
              <Input value={form.revisao} onChange={(e) => setForm({ ...form, revisao: e.target.value })} placeholder="R00" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Título</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Planta de fôrmas — Pavimento Tipo" />
            </div>
            <div className="space-y-1.5">
              <Label>Escala</Label>
              <Input value={form.escala} onChange={(e) => setForm({ ...form, escala: e.target.value })} placeholder="1:50" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending || !form.codigo.trim() || !form.titulo.trim()}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
