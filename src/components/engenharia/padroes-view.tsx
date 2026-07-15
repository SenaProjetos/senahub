"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Search, Download, Eye, Trash2, FileText, Library } from "lucide-react";
import { criarPadrao, excluirPadrao } from "@/modules/engenharia/actions";
import { TIPOS_PADRAO, TIPO_PADRAO_LABEL } from "@/modules/engenharia/schemas";
import type { GrupoPadroes } from "@/modules/engenharia/queries";
import { iconeDisciplina } from "@/lib/disciplinas";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { formatarData } from "@/lib/utils";

const SEM_DISCIPLINA = "__geral";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function ehPdf(nome: string) {
  return nome.toLowerCase().endsWith(".pdf");
}

export function PadroesView({
  grupos,
  disciplinas,
  podeIncluir,
  podeGerir,
  usuarioId,
}: {
  grupos: GrupoPadroes[];
  disciplinas: { id: string; nome: string; categoria: string | null }[];
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
  const [form, setForm] = useState({ titulo: "", tipo: "prancha", disciplinaId: SEM_DISCIPLINA, descricao: "" });

  const termo = q.trim().toLowerCase();
  const filtrados = useMemo(() => {
    if (!termo) return grupos;
    return grupos
      .map((g) => {
        const grupoCasa = g.disciplinaNome.toLowerCase().includes(termo);
        const itens = grupoCasa
          ? g.itens
          : g.itens.filter(
              (i) =>
                i.titulo.toLowerCase().includes(termo) ||
                (i.descricao ?? "").toLowerCase().includes(termo) ||
                (i.tipo ?? "").toLowerCase().includes(termo) ||
                i.arquivoNome.toLowerCase().includes(termo),
            );
        return { ...g, itens };
      })
      .filter((g) => g.itens.length > 0);
  }, [grupos, termo]);

  async function salvarNovo() {
    if (!form.titulo.trim()) return toast.error("Informe o título.");
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Selecione um arquivo.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/engenharia/padroes", { method: "POST", body: fd });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
      const r = await criarPadrao({
        titulo: form.titulo,
        tipo: form.tipo,
        disciplinaId: form.disciplinaId === SEM_DISCIPLINA ? "" : form.disciplinaId,
        descricao: form.descricao,
        meta,
      });
      if (r.ok) {
        toast.success("Padrão incluído.");
        setNovo(false);
        setForm({ titulo: "", tipo: "prancha", disciplinaId: SEM_DISCIPLINA, descricao: "" });
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function excluir(id: string, titulo: string) {
    const ok = await confirm({
      title: "Excluir padrão",
      description: `Remover "${titulo}" da biblioteca? O arquivo também é apagado.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirPadrao({ id });
      if (r.ok) {
        toast.success("Padrão excluído.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Padrões Técnicos</h1>
          <p className="text-sm text-muted-foreground">
            Biblioteca de pranchas, carimbos, detalhes e notas padrão, organizada por disciplina.
          </p>
        </div>
        {podeIncluir && (
          <Button size="sm" onClick={() => setNovo(true)}>
            <Plus className="size-3.5" /> Incluir padrão
          </Button>
        )}
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título, tipo, disciplina ou arquivo…"
          className="pl-8"
        />
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Nenhum padrão encontrado"
          description={termo ? "Ajuste a busca." : "Inclua o primeiro padrão técnico da biblioteca."}
        />
      ) : (
        <div className="space-y-5">
          {filtrados.map((g) => {
            const Icone = g.disciplinaId ? iconeDisciplina(g.disciplinaNome) : Library;
            return (
              <div key={g.disciplinaId ?? SEM_DISCIPLINA} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icone className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">{g.disciplinaNome}</h2>
                  {g.categoria && <Badge variant="outline">{g.categoria}</Badge>}
                  <span className="text-xs text-muted-foreground">{g.itens.length}</span>
                </div>
                <Card>
                  <CardContent className="p-0">
                    <ul className="divide-y">
                      {g.itens.map((i) => {
                        const podeExcluir = podeGerir || i.autorId === usuarioId;
                        return (
                          <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium">{i.titulo}</span>
                                {i.tipo && (
                                  <Badge variant="secondary" className="shrink-0">
                                    {TIPO_PADRAO_LABEL[i.tipo] ?? i.tipo}
                                  </Badge>
                                )}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                {i.descricao ? `${i.descricao} · ` : ""}
                                {i.arquivoNome} · {i.autor} · {formatarData(i.data)} · {fmtBytes(i.tamanho)}
                              </p>
                            </div>
                            {ehPdf(i.arquivoNome) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Abrir ${i.titulo}`}
                                render={<Link href={`${i.downloadUrl}?disposition=inline`} target="_blank" />}
                              >
                                <Eye className="size-3.5" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Baixar ${i.titulo}`}
                              render={<a href={i.downloadUrl} />}
                            >
                              <Download className="size-3.5" />
                            </Button>
                            {podeExcluir && (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Excluir ${i.titulo}`}
                                disabled={pending}
                                onClick={() => excluir(i.id, i.titulo)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {/* Incluir padrão */}
      <Dialog open={novo} onOpenChange={(o) => !o && setNovo(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Incluir padrão técnico</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Carimbo padrão A1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v ?? "prancha" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_PADRAO.map((t) => (
                      <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Disciplina</Label>
                <Select value={form.disciplinaId} onValueChange={(v) => setForm({ ...form, disciplinaId: v ?? SEM_DISCIPLINA })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_DISCIPLINA}>Geral (sem disciplina)</SelectItem>
                    {disciplinas.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Arquivo</Label>
              <Input ref={fileRef} type="file" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(false)}>Cancelar</Button>
            <Button onClick={salvarNovo} disabled={busy}>{busy ? "Enviando…" : "Incluir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
