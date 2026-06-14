"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, Trash2, Download, Upload, ChevronDown, FileText } from "lucide-react";
import {
  criarArquivo,
  adicionarVersaoArquivo,
  editarArquivo,
  excluirArquivo,
} from "@/modules/projetos/arquivos/actions";
import type { ArquivoProjetoItem } from "@/modules/projetos/arquivos/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIAS = ["contrato", "planta", "memorial", "foto", "administrativo", "outro"] as const;

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type Meta = { caminho: string; nomeArquivo: string; mime: string; tamanho: number; hashSha256: string };

async function enviarArquivo(file: File): Promise<Meta> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/projetos/arquivos", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Falha no upload.");
  return json as Meta;
}

export function ArquivosView({
  projeto,
  arquivos,
  podeGerir,
}: {
  projeto: { id: string; codigo: string; nome: string };
  arquivos: ArquivoProjetoItem[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<ArquivoProjetoItem | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ nome: "", categoria: "outro", descricao: "" });
  const fileNovo = useRef<HTMLInputElement>(null);
  const fileVersao = useRef<HTMLInputElement>(null);
  const [alvoVersao, setAlvoVersao] = useState<string | null>(null);

  function abrirNovo() {
    setForm({ nome: "", categoria: "outro", descricao: "" });
    setNovo(true);
  }
  function abrirEditar(a: ArquivoProjetoItem) {
    setForm({ nome: a.nome, categoria: a.categoria ?? "outro", descricao: a.descricao ?? "" });
    setEditar(a);
  }

  async function salvarNovo() {
    const file = fileNovo.current?.files?.[0];
    if (!form.nome.trim() || !file) {
      toast.error("Informe o nome e selecione um arquivo.");
      return;
    }
    setBusy(true);
    try {
      const meta = await enviarArquivo(file);
      const r = await criarArquivo({
        projetoId: projeto.id,
        nome: form.nome,
        categoria: form.categoria,
        descricao: form.descricao,
        meta,
      });
      if (r.ok) {
        toast.success("Arquivo enviado.");
        setNovo(false);
        router.refresh();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function salvarEdicao() {
    if (!editar || !form.nome.trim()) return;
    start(async () => {
      const r = await editarArquivo({ id: editar.id, nome: form.nome, categoria: form.categoria, descricao: form.descricao });
      if (r.ok) {
        toast.success("Arquivo atualizado.");
        setEditar(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function enviarVersao(arquivoId: string, file: File) {
    setBusy(true);
    try {
      const meta = await enviarArquivo(file);
      const r = await adicionarVersaoArquivo({ arquivoId, meta });
      if (r.ok) {
        toast.success(`Versão ${r.data.numero} adicionada.`);
        router.refresh();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setAlvoVersao(null);
    }
  }

  function excluir(id: string) {
    start(async () => {
      const r = await excluirArquivo({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <input
        ref={fileVersao}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && alvoVersao) enviarVersao(alvoVersao, f);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/projetos/${projeto.id}`} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3" /> {formatarCodigo(projeto.codigo)} · {projeto.nome}
          </Link>
          <h2 className="text-2xl font-extrabold tracking-tight">Arquivos do projeto</h2>
          <p className="text-sm text-muted-foreground">Repositório geral versionado (documentos, plantas, fotos).</p>
        </div>
        {podeGerir && (
          <Button size="sm" onClick={abrirNovo}>
            <Plus className="size-3.5" /> Arquivo
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {arquivos.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum arquivo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Nome</th>
                  <th className="px-4 py-2">Categoria</th>
                  <th className="px-4 py-2 text-center">Versão</th>
                  <th className="px-4 py-2 text-right">Tamanho</th>
                  <th className="px-4 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {arquivos.map((a) => (
                  <Fragment key={a.id}>
                    <tr className="hover:bg-muted/40">
                      <td className="px-4 py-2">
                        <button
                          className="inline-flex items-center gap-1.5 text-left hover:underline"
                          onClick={() => setAberto(aberto === a.id ? null : a.id)}
                        >
                          <FileText className="size-3.5 text-muted-foreground" />
                          <span className="font-medium">{a.nome}</span>
                          {a.totalVersoes > 1 && <ChevronDown className="size-3 text-muted-foreground" />}
                        </button>
                        {a.descricao && <p className="text-xs text-muted-foreground">{a.descricao}</p>}
                      </td>
                      <td className="px-4 py-2">
                        {a.categoria ? <Badge variant="outline" className="capitalize">{a.categoria}</Badge> : "—"}
                      </td>
                      <td className="px-4 py-2 text-center font-mono text-xs">v{a.atual?.numero ?? 1}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{a.atual ? fmtBytes(a.atual.tamanho) : "—"}</td>
                      <td className="px-4 py-2 text-right">
                        {a.atual && (
                          <Button size="icon" variant="ghost" aria-label="Baixar" render={<a href={`/api/projetos/arquivos/${a.atual.id}/download`} />}>
                            <Download className="size-3.5" />
                          </Button>
                        )}
                        {podeGerir && (
                          <>
                            <Button size="icon" variant="ghost" aria-label="Nova versão" disabled={busy} onClick={() => { setAlvoVersao(a.id); fileVersao.current?.click(); }}>
                              <Upload className="size-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => abrirEditar(a)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" aria-label="Excluir" disabled={pending} onClick={() => excluir(a.id)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                    {aberto === a.id && a.versoes.length > 0 && (
                      <tr className="bg-muted/20">
                        <td colSpan={5} className="px-4 py-2">
                          <ul className="space-y-1 text-xs">
                            {a.versoes.map((v) => (
                              <li key={v.id} className="flex items-center justify-between gap-3">
                                <span className="font-mono">v{v.numero}</span>
                                <span className="min-w-0 flex-1 truncate text-muted-foreground">{v.nomeArquivo}</span>
                                <span className="text-muted-foreground">{v.autor}</span>
                                <span className="font-mono text-muted-foreground">{new Date(v.criadoEm).toLocaleDateString("pt-BR")}</span>
                                <a href={`/api/projetos/arquivos/${v.id}/download`} className="inline-flex items-center gap-1 hover:underline">
                                  <Download className="size-3" /> baixar
                                </a>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Novo arquivo */}
      <Dialog open={novo} onOpenChange={(o) => !o && setNovo(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo arquivo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Contrato assinado" />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v ?? "outro" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Arquivo</Label>
              <Input ref={fileNovo} type="file" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(false)}>Cancelar</Button>
            <Button onClick={salvarNovo} disabled={busy}>{busy ? "Enviando…" : "Enviar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar metadados */}
      <Dialog open={!!editar} onOpenChange={(o) => !o && setEditar(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar arquivo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v ?? "outro" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditar(null)}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
