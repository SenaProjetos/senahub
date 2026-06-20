"use client";

import { useRef, useState, useTransition } from "react";
import { formatarData } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import { Plus, Upload, Download, Trash2, Folder, FolderPlus, X, FileText, ShieldCheck, Eye } from "lucide-react";
import {
  criarDocJuridico,
  excluirDocJuridico,
  criarCertidao,
  excluirCertidao,
  criarPastaJuridica,
  excluirPastaJuridica,
  moverDocPasta,
  criarModeloContrato,
  editarModeloContrato,
  excluirModeloContrato,
  novaVersaoCertidao,
} from "@/modules/juridico/actions";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Doc = {
  id: string;
  titulo: string;
  tipo: string;
  pastaId: string | null;
  projeto: string | null;
  cliente: string | null;
  versoes: { id: string; numero: number; arquivoNome: string; autor: string; data: string }[];
};
type Cert = { id: string; tipo: string; descricao: string | null; validade: string; versoes: number };
type Pasta = { id: string; nome: string; total: number };
type Modelo = { id: string; nome: string; categoria: string | null; conteudo: string };

const NONE = "__none";
const TIPOS_DOC = ["contrato", "aditivo", "proposta", "procuracao", "outro"];

const ehPdf = (nome: string) => nome.toLowerCase().endsWith(".pdf");

export function JuridicoView({
  docs,
  certidoes,
  modelos,
  tipos,
  projetos,
  clientes,
  pastas,
  podeGerir,
}: {
  docs: Doc[];
  certidoes: Cert[];
  modelos: Modelo[];
  tipos: { id: string; nome: string }[];
  projetos: { id: string; label: string }[];
  clientes: { id: string; label: string }[];
  pastas: Pasta[];
  podeGerir: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Jurídico</h2>
        <p className="text-sm text-muted-foreground">
          Contratos versionados e certidões com controle de validade.
        </p>
      </div>

      <Tabs defaultValue="docs">
        <TabsList>
          <TabsTrigger value="docs">Documentos</TabsTrigger>
          <TabsTrigger value="certidoes">Certidões</TabsTrigger>
          <TabsTrigger value="modelos">Modelos</TabsTrigger>
        </TabsList>
        <Card className="mt-3">
          <CardContent className="pt-5">
            <TabsContent value="docs">
              <DocsTab docs={docs} projetos={projetos} clientes={clientes} pastas={pastas} podeGerir={podeGerir} />
            </TabsContent>
            <TabsContent value="certidoes">
              <CertidoesTab certidoes={certidoes} tipos={tipos} podeGerir={podeGerir} />
            </TabsContent>
            <TabsContent value="modelos">
              <ModelosTab modelos={modelos} podeGerir={podeGerir} />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}

const SEM_PASTA = "__sempasta";

function DocsTab({
  docs,
  projetos,
  clientes,
  pastas,
  podeGerir,
}: {
  docs: Doc[];
  projetos: { id: string; label: string }[];
  clientes: { id: string; label: string }[];
  pastas: Pasta[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("contrato");
  const [projetoId, setProjetoId] = useState(NONE);
  const [clienteId, setClienteId] = useState(NONE);
  const [pastaId, setPastaId] = useState(NONE);
  const [filtro, setFiltro] = useState<string | null>(null); // null = todas; SEM_PASTA; ou id
  const [novaPasta, setNovaPasta] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadDoc, setUploadDoc] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; nome: string } | null>(null);

  const docsVisiveis =
    filtro === null
      ? docs
      : filtro === SEM_PASTA
        ? docs.filter((d) => !d.pastaId)
        : docs.filter((d) => d.pastaId === filtro);
  const nomePasta = (id: string | null) => (id ? (pastas.find((p) => p.id === id)?.nome ?? null) : null);

  function criar() {
    if (!titulo.trim()) return toast.error("Informe o título.");
    start(async () => {
      const r = await criarDocJuridico({
        titulo,
        tipo: tipo as never,
        projetoId: projetoId === NONE ? "" : projetoId,
        clienteId: clienteId === NONE ? "" : clienteId,
        pastaId: pastaId === NONE ? "" : pastaId,
        observacao: "",
      });
      if (r.ok) {
        toast.success("Documento criado — envie a primeira versão.");
        setTitulo("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function criarPasta() {
    if (!novaPasta.trim()) return;
    start(async () => {
      const r = await criarPastaJuridica({ nome: novaPasta, parentId: "" });
      if (r.ok) {
        toast.success("Pasta criada.");
        setNovaPasta("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function excluirPasta(id: string) {
    start(async () => {
      const r = await excluirPastaJuridica({ id });
      if (r.ok) {
        if (filtro === id) setFiltro(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function mover(id: string, pasta: string) {
    start(async () => {
      const r = await moverDocPasta({ id, pastaId: pasta === NONE ? "" : pasta });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  async function enviarVersao(file: File | null) {
    if (!file || !uploadDoc) return;
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/juridico/docs/${uploadDoc}/versao`, { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) {
      toast.success(`Versão v${data.numero} enviada.`);
      router.refresh();
    } else toast.error(data.error ?? "Falha no upload.");
    if (uploadRef.current) uploadRef.current.value = "";
    setUploadDoc(null);
  }

  function excluir(id: string) {
    start(async () => {
      const r = await excluirDocJuridico({ id });
      if (r.ok) {
        toast.success("Documento excluído.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {podeGerir && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-dashed p-3">
          <Input className="w-56" placeholder="Título do documento…" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <Select value={tipo} onValueChange={(v) => setTipo(v ?? "contrato")}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_DOC.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={projetoId} onValueChange={(v) => setProjetoId(v ?? NONE)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Projeto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem projeto</SelectItem>
              {projetos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={clienteId} onValueChange={(v) => setClienteId(v ?? NONE)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem cliente</SelectItem>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={pastaId} onValueChange={(v) => setPastaId(v ?? NONE)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Pasta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem pasta</SelectItem>
              {pastas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={criar} disabled={pending}>
            <Plus className="size-3.5" /> Criar
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setFiltro(null)}
          className={`rounded-sm border px-2.5 py-1 text-xs ${filtro === null ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          Todas ({docs.length})
        </button>
        <button
          onClick={() => setFiltro(SEM_PASTA)}
          className={`rounded-sm border px-2.5 py-1 text-xs ${filtro === SEM_PASTA ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          Sem pasta ({docs.filter((d) => !d.pastaId).length})
        </button>
        {pastas.map((p) => (
          <span
            key={p.id}
            className={`inline-flex items-center gap-1 rounded-sm border px-2.5 py-1 text-xs ${filtro === p.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
          >
            <button onClick={() => setFiltro(p.id)} className="inline-flex items-center gap-1 hover:text-foreground">
              <Folder className="size-3" /> {p.nome} ({p.total})
            </button>
            {podeGerir && (
              <button onClick={() => excluirPasta(p.id)} aria-label="Excluir pasta" className="hover:text-destructive" disabled={pending}>
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        {podeGerir && (
          <span className="inline-flex items-center gap-1">
            <Input
              className="h-7 w-32 text-xs"
              placeholder="Nova pasta…"
              value={novaPasta}
              onChange={(e) => setNovaPasta(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && criarPasta()}
            />
            <Button size="icon" variant="ghost" aria-label="Criar pasta" onClick={criarPasta} disabled={pending || !novaPasta.trim()}>
              <FolderPlus className="size-4" />
            </Button>
          </span>
        )}
      </div>

      <input ref={uploadRef} type="file" className="hidden" onChange={(e) => enviarVersao(e.target.files?.[0] ?? null)} />

      {docsVisiveis.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum documento." />
      ) : (
        <div className="space-y-3">
          {docsVisiveis.map((d) => (
            <div key={d.id} className="rounded-sm border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{d.titulo}</span>
                <Badge variant="outline">{d.tipo}</Badge>
                {nomePasta(d.pastaId) && (
                  <Badge variant="outline" className="text-info border-info/40">
                    <Folder className="mr-1 size-3" /> {nomePasta(d.pastaId)}
                  </Badge>
                )}
                {d.projeto && <span className="font-mono text-xs text-muted-foreground">{formatarCodigo(d.projeto)}</span>}
                {d.cliente && <span className="text-xs text-muted-foreground">{d.cliente}</span>}
                <div className="ml-auto flex items-center gap-1.5">
                  {podeGerir && (
                    <>
                      <Select value={d.pastaId ?? NONE} onValueChange={(v) => mover(d.id, v ?? NONE)}>
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue placeholder="Pasta" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Sem pasta</SelectItem>
                          {pastas.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setUploadDoc(d.id);
                          uploadRef.current?.click();
                        }}
                      >
                        <Upload className="size-3.5" /> Nova versão
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir(d.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {d.versoes.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {d.versoes.map((v, i) => (
                    <li key={v.id} className="flex items-center gap-2 text-muted-foreground">
                      <span className={`font-mono ${i === 0 ? "font-bold text-foreground" : ""}`}>
                        v{v.numero}
                        {i === 0 && " (atual)"}
                      </span>
                      <span className="truncate">{v.arquivoNome}</span>
                      <span>· {v.autor} · {formatarData(v.data)}</span>
                      {ehPdf(v.arquivoNome) && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreview({ url: `/api/juridico/versoes/${v.id}/download?inline=1`, nome: v.arquivoNome })
                          }
                          className="text-primary hover:text-primary/80"
                          aria-label="Visualizar"
                          title="Visualizar"
                        >
                          <Eye className="size-3.5" />
                        </button>
                      )}
                      <a href={`/api/juridico/versoes/${v.id}/download`} className="text-primary" aria-label="Baixar">
                        <Download className="size-3.5" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.nome}</DialogTitle>
          </DialogHeader>
          {preview && (
            <iframe src={preview.url} className="h-[80svh] w-full rounded-sm border" title={preview.nome} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CertidoesTab({
  certidoes,
  tipos,
  podeGerir,
}: {
  certidoes: Cert[];
  tipos: { id: string; nome: string }[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tipoId, setTipoId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [validade, setValidade] = useState("");

  function criar() {
    start(async () => {
      const r = await criarCertidao({ tipoId, descricao, validade });
      if (r.ok) {
        toast.success("Certidão registrada.");
        setDescricao("");
        setValidade("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function excluir(id: string) {
    start(async () => {
      const r = await excluirCertidao({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }
  function novaVersao(id: string) {
    const v = window.prompt("Nova validade da certidão (AAAA-MM-DD):");
    if (!v?.trim()) return;
    start(async () => {
      const r = await novaVersaoCertidao({ certidaoId: id, validade: v });
      if (r.ok) {
        toast.success("Nova versão registrada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function badgeValidade(validade: string) {
    const dias = differenceInCalendarDays(new Date(validade + "T00:00:00"), new Date());
    if (dias < 0) return <Badge variant="outline" className="text-destructive border-destructive/40">vencida</Badge>;
    if (dias <= 30)
      return <Badge variant="outline" className="text-warning border-warning/40">vence em {dias}d</Badge>;
    return <Badge variant="outline" className="text-success border-success/40">ok</Badge>;
  }

  return (
    <div className="space-y-4">
      {podeGerir && (
        <div className="flex flex-wrap items-end gap-2 rounded-sm border border-dashed p-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select value={tipoId} onValueChange={(v) => setTipoId(v ?? "")}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {tipos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Descrição</Label>
            <Input className="w-52" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Validade</Label>
            <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
          </div>
          <Button size="sm" onClick={criar} disabled={pending || !tipoId || !validade}>
            <Plus className="size-3.5" /> Registrar
          </Button>
        </div>
      )}

      {certidoes.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Nenhuma certidão." />
      ) : (
        <ul className="divide-y rounded-sm border">
          {certidoes.map((c) => (
            <li key={c.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="font-medium">{c.tipo}</span>
              {c.descricao && <span className="text-muted-foreground">{c.descricao}</span>}
              <span className="ml-auto font-mono text-xs">
                {formatarData(c.validade)}
              </span>
              {badgeValidade(c.validade)}
              {c.versoes > 0 && <span className="font-mono text-[10px] text-muted-foreground">{c.versoes} versão(ões)</span>}
              {podeGerir && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => novaVersao(c.id)}>Nova versão</Button>
                  <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir(c.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModelosTab({ modelos, podeGerir }: { modelos: Modelo[]; podeGerir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<Modelo | "novo" | null>(null);
  const [form, setForm] = useState({ nome: "", categoria: "", conteudo: "" });

  function abrir(m: Modelo | "novo") {
    if (m === "novo") setForm({ nome: "", categoria: "", conteudo: "" });
    else setForm({ nome: m.nome, categoria: m.categoria ?? "", conteudo: m.conteudo });
    setEdit(m);
  }
  function salvar() {
    if (!form.nome.trim()) return toast.error("Informe o nome.");
    start(async () => {
      const r = edit && edit !== "novo"
        ? await editarModeloContrato({ id: edit.id, nome: form.nome, categoria: form.categoria, conteudo: form.conteudo })
        : await criarModeloContrato({ nome: form.nome, categoria: form.categoria, conteudo: form.conteudo });
      if (r.ok) {
        toast.success("Modelo salvo.");
        setEdit(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function excluir(id: string) {
    start(async () => {
      const r = await excluirModeloContrato({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {podeGerir && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => abrir("novo")}><Plus className="size-3.5" /> Novo modelo</Button>
        </div>
      )}
      {modelos.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum modelo de contrato." />
      ) : (
        <ul className="divide-y rounded-sm border">
          {modelos.map((m) => (
            <li key={m.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="font-medium">{m.nome}</span>
              {m.categoria && <Badge variant="outline">{m.categoria}</Badge>}
              <span className="ml-auto font-mono text-xs text-muted-foreground">{m.conteudo.length} car.</span>
              {podeGerir && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => abrir(m)}>Editar</Button>
                  <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir(m.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{edit && edit !== "novo" ? "Editar modelo" : "Novo modelo"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="prestação de serviço…" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Conteúdo</Label>
              <textarea
                value={form.conteudo}
                onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                rows={8}
                className="w-full rounded-sm border bg-transparent p-2 font-mono text-xs"
                placeholder="Cláusulas do modelo…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
