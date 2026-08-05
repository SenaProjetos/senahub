"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Download, Eye, Trash2, Pencil, Library, Link as LinkIcon } from "lucide-react";
import { criarReferencia, editarReferencia, excluirReferencia } from "@/modules/engenharia/referencias/actions";
import { TIPOS_REFERENCIA, TIPO_REFERENCIA_LABEL } from "@/modules/engenharia/referencias/schemas";
import type { ReferenciaItem } from "@/modules/engenharia/referencias/queries";
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

/** Corpo da rota de upload: metadata em caso de sucesso, `error` em caso de falha. */
type RespostaUpload = {
  caminho: string;
  nomeArquivo: string;
  mime?: string | null;
  tamanho: number;
  hashSha256?: string | null;
  error?: string;
};

const TODOS = "__todos";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type FormState = {
  id: string | null;
  titulo: string;
  tipo: string;
  autorObra: string;
  ano: string;
  tags: string;
  descricao: string;
  linkExterno: string;
};

const FORM_VAZIO: FormState = { id: null, titulo: "", tipo: "artigo", autorObra: "", ano: "", tags: "", descricao: "", linkExterno: "" };

export function ReferenciasView({
  referencias,
  podeIncluir,
  podeGerir,
  usuarioId,
}: {
  referencias: ReferenciaItem[];
  podeIncluir: boolean;
  podeGerir: boolean;
  usuarioId: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState(TODOS);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);

  const termo = q.trim().toLowerCase();
  const filtradas = useMemo(() => {
    return referencias.filter((r) => {
      if (tipoFiltro !== TODOS && r.tipo !== tipoFiltro) return false;
      if (!termo) return true;
      return (
        r.titulo.toLowerCase().includes(termo) ||
        (r.autorObra ?? "").toLowerCase().includes(termo) ||
        r.tags.some((t) => t.toLowerCase().includes(termo))
      );
    });
  }, [referencias, termo, tipoFiltro]);

  function abrirNova() {
    setForm(FORM_VAZIO);
    if (fileRef.current) fileRef.current.value = "";
    setDialogAberto(true);
  }

  function abrirEdicao(r: ReferenciaItem) {
    setForm({
      id: r.id,
      titulo: r.titulo,
      tipo: r.tipo,
      autorObra: r.autorObra ?? "",
      ano: r.ano ? String(r.ano) : "",
      tags: r.tags.join(", "),
      descricao: r.descricao ?? "",
      linkExterno: r.linkExterno ?? "",
    });
    if (fileRef.current) fileRef.current.value = "";
    setDialogAberto(true);
  }

  async function salvar() {
    if (!form.titulo.trim()) return toast.error("Informe o título.");
    const file = fileRef.current?.files?.[0];
    if (!file && !form.linkExterno.trim() && !form.id) {
      return toast.error("Anexe um arquivo ou informe um link externo.");
    }
    setBusy(true);
    try {
      let meta: RespostaUpload | undefined;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/engenharia/referencias", { method: "POST", body: fd });
        // Resposta de erro pode vir sem corpo JSON (500 do runtime, página da CDN);
        // ler antes de checar o status esconderia a causa atrás de um erro de parse.
        const parsed = (await res.json().catch(() => null)) as RespostaUpload | null;
        if (!res.ok || !parsed?.caminho) {
          throw new Error(parsed?.error ?? `Falha no upload (HTTP ${res.status}).`);
        }
        meta = parsed;
      }
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const payload = {
        titulo: form.titulo,
        tipo: form.tipo,
        autorObra: form.autorObra || undefined,
        ano: form.ano ? Number(form.ano) : undefined,
        tags,
        descricao: form.descricao || undefined,
        linkExterno: form.linkExterno || undefined,
        meta,
      };
      const r = form.id ? await editarReferencia({ id: form.id, ...payload }) : await criarReferencia(payload);
      if (r.ok) {
        toast.success(form.id ? "Referência atualizada." : "Referência catalogada.");
        setDialogAberto(false);
        setForm(FORM_VAZIO);
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
      title: "Excluir referência",
      description: `Remover "${titulo}" do catálogo? O anexo (se houver) também é apagado.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirReferencia({ id });
      if (r.ok) {
        toast.success("Referência excluída.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Referências Técnicas</h1>
          <p className="text-sm text-muted-foreground">
            Artigos, livros, notas técnicas e materiais de referência — busca por título, autor ou tags.
          </p>
        </div>
        {podeIncluir && (
          <Button size="sm" onClick={abrirNova}>
            <Plus className="size-3.5" /> Incluir referência
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título, autor ou tag…"
            className="pl-8"
          />
        </div>
        <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v ?? TODOS)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os tipos</SelectItem>
            {TIPOS_REFERENCIA.map((t) => (
              <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtradas.length === 0 ? (
            <EmptyState
              icon={Library}
              title="Nenhuma referência encontrada"
              description={termo || tipoFiltro !== TODOS ? "Ajuste a busca ou o filtro." : "Catalogue a primeira referência técnica."}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Título</th>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Autor / Ano</th>
                    <th className="px-4 py-2">Tags</th>
                    <th className="px-4 py-2">Cadastro</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtradas.map((r) => {
                    const podeEditar = podeGerir || r.autorId === usuarioId;
                    return (
                      <tr key={r.id} className="hover:bg-muted/40">
                        <td className="px-4 py-2 font-medium">{r.titulo}</td>
                        <td className="px-4 py-2 text-xs">{TIPO_REFERENCIA_LABEL[r.tipo] ?? r.tipo}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {[r.autorObra, r.ano].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {r.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {r.autor} · {formatarData(r.data)}
                          {r.tamanho != null && <> · {fmtBytes(r.tamanho)}</>}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          {r.downloadUrl && (
                            <>
                              {r.mime === "application/pdf" && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Abrir ${r.titulo}`}
                                  render={<a href={`${r.downloadUrl}?disposition=inline`} target="_blank" rel="noreferrer" />}
                                >
                                  <Eye className="size-3.5" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Baixar ${r.titulo}`}
                                render={<a href={r.downloadUrl} />}
                              >
                                <Download className="size-3.5" />
                              </Button>
                            </>
                          )}
                          {r.linkExterno && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Link externo de ${r.titulo}`}
                              render={<a href={r.linkExterno} target="_blank" rel="noreferrer" />}
                            >
                              <LinkIcon className="size-3.5" />
                            </Button>
                          )}
                          {podeEditar && (
                            <Button size="icon" variant="ghost" aria-label={`Editar ${r.titulo}`} onClick={() => abrirEdicao(r)}>
                              <Pencil className="size-3.5" />
                            </Button>
                          )}
                          {podeEditar && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Excluir ${r.titulo}`}
                              disabled={pending}
                              onClick={() => excluir(r.id, r.titulo)}
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

      {/* Incluir/editar referência */}
      <Dialog open={dialogAberto} onOpenChange={(o) => !o && setDialogAberto(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar referência" : "Incluir referência técnica"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Fundações profundas em solo residual" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v ?? "artigo" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_REFERENCIA.map((t) => (
                      <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ano</Label>
                <Input type="number" min="1900" max="2100" value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Autor da obra</Label>
              <Input value={form.autorObra} onChange={(e) => setForm({ ...form, autorObra: e.target.value })} placeholder="Ex.: Velloso & Lopes" />
            </div>
            <div className="space-y-1.5">
              <Label>Tags (separe por vírgula)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="fundações, geotecnia…" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <textarea
                rows={4}
                className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Resumo opcional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Link externo</Label>
              <Input value={form.linkExterno} onChange={(e) => setForm({ ...form, linkExterno: e.target.value })} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label>Arquivo (opcional{form.id ? " — deixe em branco p/ manter o atual" : ""})</Label>
              <Input ref={fileRef} type="file" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={busy}>{busy ? "Salvando…" : form.id ? "Salvar" : "Incluir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
