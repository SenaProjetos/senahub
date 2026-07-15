"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Download, Eye, Trash2, BookMarked } from "lucide-react";
import { criarNorma, excluirNorma } from "@/modules/engenharia/actions";
import type { NormaItem } from "@/modules/engenharia/queries";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { formatarData } from "@/lib/utils";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function NormasView({
  normas,
  podeIncluir,
  podeGerir,
  usuarioId,
}: {
  normas: NormaItem[];
  podeIncluir: boolean;
  podeGerir: boolean;
  usuarioId: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [novo, setNovo] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ numero: "", titulo: "", ano: String(new Date().getFullYear()) });

  const termo = q.trim().toLowerCase();
  const filtradas = useMemo(() => {
    if (!termo) return normas;
    return normas.filter(
      (n) =>
        n.numero.toLowerCase().includes(termo) ||
        n.titulo.toLowerCase().includes(termo) ||
        String(n.ano).includes(termo),
    );
  }, [normas, termo]);

  async function salvarNova() {
    if (!form.numero.trim() || !form.titulo.trim()) return toast.error("Número e título são obrigatórios.");
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Selecione o PDF da norma.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/engenharia/normas", { method: "POST", body: fd });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
      const r = await criarNorma({ numero: form.numero, titulo: form.titulo, ano: Number(form.ano), meta });
      if (r.ok) {
        toast.success("Norma catalogada.");
        setNovo(false);
        setForm({ numero: "", titulo: "", ano: String(new Date().getFullYear()) });
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function excluir(id: string, numero: string) {
    const ok = await confirm({
      title: "Excluir norma",
      description: `Remover "${numero}" do catálogo? O PDF também é apagado.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirNorma({ id });
      if (r.ok) {
        toast.success("Norma excluída.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Normas Técnicas</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de normas em PDF — número, título e ano da versão. Busca por qualquer campo.
          </p>
        </div>
        {podeIncluir && (
          <Button size="sm" onClick={() => setNovo(true)}>
            <Plus className="size-3.5" /> Incluir norma
          </Button>
        )}
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por número, título ou ano…"
          className="pl-8"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {filtradas.length === 0 ? (
            <EmptyState
              icon={BookMarked}
              title="Nenhuma norma encontrada"
              description={termo ? "Ajuste a busca." : "Catalogue a primeira norma técnica."}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Número</th>
                    <th className="px-4 py-2">Título</th>
                    <th className="px-4 py-2 text-right">Ano</th>
                    <th className="px-4 py-2">Arquivo</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtradas.map((n) => {
                    const podeExcluir = podeGerir || n.autorId === usuarioId;
                    return (
                      <tr key={n.id} className="hover:bg-muted/40">
                        <td className="px-4 py-2 font-mono text-xs font-semibold">{n.numero}</td>
                        <td className="px-4 py-2">{n.titulo}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs">{n.ano}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {n.autor} · {formatarData(n.data)} · {fmtBytes(n.tamanho)}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Abrir ${n.numero}`}
                            render={<a href={`${n.downloadUrl}?disposition=inline`} target="_blank" rel="noreferrer" />}
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Baixar ${n.numero}`}
                            render={<a href={n.downloadUrl} />}
                          >
                            <Download className="size-3.5" />
                          </Button>
                          {podeExcluir && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Excluir ${n.numero}`}
                              disabled={pending}
                              onClick={() => excluir(n.id, n.numero)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Incluir norma */}
      <Dialog open={novo} onOpenChange={(o) => !o && setNovo(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Incluir norma técnica</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} placeholder="Ex.: NBR 6118" />
              </div>
              <div className="space-y-1.5">
                <Label>Ano da versão</Label>
                <Input type="number" min="1900" max="2100" value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Projeto de estruturas de concreto" />
            </div>
            <div className="space-y-1.5">
              <Label>Arquivo (PDF)</Label>
              <Input ref={fileRef} type="file" accept="application/pdf,.pdf" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(false)}>Cancelar</Button>
            <Button onClick={salvarNova} disabled={busy}>{busy ? "Enviando…" : "Incluir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
