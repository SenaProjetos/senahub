"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronRight,
  Folder,
  FolderOpen,
  File as FileIcon,
  FileText,
  FileCode,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  Download,
  Upload as UploadIcon,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  XCircle,
} from "lucide-react";
import { foraDoPadrao } from "@/modules/projetos/pranchas/codigo";
import type {
  ArvoreDisciplina,
  ArvoreArquivoItem,
  ArquivoProjetoItem,
} from "@/modules/projetos/arquivos/queries";
import {
  criarArquivo,
  editarArquivo,
  excluirArquivo,
  adicionarVersaoArquivo,
} from "@/modules/projetos/arquivos/actions";
import { renomearUpload } from "@/modules/uploads/actions";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { TAMANHO_MAX, TAMANHO_MAX_LABEL } from "@/modules/uploads/limites";
import { cn, formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Subpasta por extensão (paridade com o explorer do hub anterior) ──
const SUBPASTAS = ["PDF", "DWG", "DOCs", "IFC", "BACKUP", "Outros arquivos"] as const;
type Subpasta = (typeof SUBPASTAS)[number];

const EXT_SUBPASTA: Record<string, Subpasta> = {
  pdf: "PDF",
  dwg: "DWG", dxf: "DWG", dwf: "DWG",
  doc: "DOCs", docx: "DOCs", xls: "DOCs", xlsx: "DOCs", txt: "DOCs",
  ifc: "IFC", ifcxml: "IFC", ifczip: "IFC",
  rvt: "BACKUP", skp: "BACKUP", tqs: "BACKUP", zip: "BACKUP", rar: "BACKUP", "7z": "BACKUP", qibzip: "BACKUP",
};

// ── Pacotes (mesma ordem/rótulos do painel da disciplina) ──
const PACOTES = ["A", "B", "RECEBIDOS", "OUTROS"] as const;
type Pacote = (typeof PACOTES)[number];
const PACOTE_LABEL: Record<Pacote, string> = {
  A: "Pranchas e arquivos",
  B: "Backup do modelo",
  RECEBIDOS: "Recebidos do cliente",
  OUTROS: "Outros (não suportados)",
};

const CATEGORIAS_GERAL = ["contrato", "planta", "memorial", "foto", "administrativo", "outro"] as const;

function extDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i >= 0 ? nome.slice(i + 1).toLowerCase() : "";
}
function subpastaDe(nome: string): Subpasta {
  return EXT_SUBPASTA[extDe(nome)] ?? "Outros arquivos";
}
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function IconeArquivo({ nome }: { nome: string }) {
  const ext = extDe(nome);
  if (ext === "pdf") return <FileText className="size-4 shrink-0 text-destructive" />;
  if (["dwg", "dxf", "dwf"].includes(ext)) return <FileCode className="size-4 shrink-0 text-primary" />;
  if (["xls", "xlsx", "doc", "docx", "txt"].includes(ext)) return <FileSpreadsheet className="size-4 shrink-0 text-success" />;
  if (["ifc", "ifcxml", "ifczip"].includes(ext)) return <FileCode className="size-4 shrink-0 text-violet-500" />;
  if (["zip", "rar", "7z", "tqs", "rvt", "skp", "qibzip"].includes(ext)) return <FileArchive className="size-4 shrink-0 text-warning" />;
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return <ImageIcon className="size-4 shrink-0 text-pink-500" />;
  return <FileIcon className="size-4 shrink-0 text-muted-foreground" />;
}

/** Nó de pasta genérico e colapsável. */
function Pasta({
  nome,
  contagem,
  nivel,
  abertoInicial = false,
  acao,
  children,
}: {
  nome: string;
  contagem: number;
  nivel: number;
  abertoInicial?: boolean;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  return (
    <div>
      <div
        className="flex items-center gap-1.5 rounded-sm py-1.5 pr-2 hover:bg-muted/50"
        style={{ paddingLeft: `${nivel * 1.25 + 0.25}rem` }}
      >
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={aberto}
        >
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-90")} />
          {aberto ? (
            <FolderOpen className="size-4 shrink-0 text-warning" />
          ) : (
            <Folder className="size-4 shrink-0 text-warning" />
          )}
          <span className="truncate text-sm font-medium">{nome}</span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {contagem} arquivo{contagem === 1 ? "" : "s"}
          </span>
        </button>
        {acao}
      </div>
      {aberto && children}
    </div>
  );
}

function LinhaArquivo({
  a,
  nivel,
  onRenomear,
  foraPadrao,
}: {
  a: ArvoreArquivoItem;
  nivel: number;
  onRenomear?: (a: ArvoreArquivoItem) => void;
  foraPadrao?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-sm py-1 pr-2 text-sm hover:bg-muted/40"
      style={{ paddingLeft: `${nivel * 1.25 + 0.75}rem` }}
    >
      <IconeArquivo nome={a.nome} />
      <span className="min-w-0 flex-1 truncate" title={a.nome}>
        {a.nome}
        {a.versao > 1 && <span className="ml-1 font-mono text-xs text-muted-foreground">v{a.versao}</span>}
      </span>
      {foraPadrao && (
        <span
          className="flex shrink-0 items-center gap-1 text-xs text-warning"
          title="Nome fora do padrão da Lista Mestre — renomeie para o padrão {proj}-{disc}-{fase}-{nº}-{tipo}."
        >
          <AlertTriangle className="size-3.5" /> fora do padrão
        </span>
      )}
      {a.aprovado ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-status-aprovado" title={`Aprovado · ${formatarData(a.data)}`}>
          <CheckCircle2 className="size-3.5" /> aprovado
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Aguardando validação">
          <Clock className="size-3.5" /> pendente
        </span>
      )}
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmtBytes(a.tamanho)}</span>
      {onRenomear && (
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={`Renomear ${a.nome}`}
          title="Renomear"
          onClick={() => onRenomear(a)}
        >
          <Pencil className="size-3.5" />
        </button>
      )}
      <a href={a.downloadUrl} className="shrink-0 text-primary hover:text-primary/80" aria-label={`Baixar ${a.nome}`}>
        <Download className="size-3.5" />
      </a>
    </div>
  );
}

function RenomearDialog({ item, onClose }: { item: ArvoreArquivoItem | null; onClose: () => void }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (item && item.id !== lastId) {
    setLastId(item.id);
    setNome(item.nome);
  }

  function salvar() {
    if (!item || !nome.trim()) return;
    start(async () => {
      const r = await renomearUpload({ uploadId: item.id, nome: nome.trim() });
      if (r.ok) {
        toast.success("Arquivo renomeado.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renomear arquivo</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Novo nome</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && salvar()} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Agrupa os arquivos de uma disciplina em pacote → subpasta(extensão). */
function agruparPorPacote(arquivos: ArvoreArquivoItem[]) {
  return PACOTES.map((p) => {
    const doPacote = arquivos.filter((a) => a.pacote === p);
    const subpastas = SUBPASTAS.map((s) => ({
      nome: s,
      arquivos: doPacote.filter((a) => subpastaDe(a.nome) === s),
    })).filter((s) => s.arquivos.length > 0);
    return { pacote: p, total: doPacote.length, subpastas };
  }).filter((g) => g.total > 0);
}

export function ArquivosExplorer({
  projeto,
  disciplinas,
  geral,
  podeGerirGeral,
  nomenclatura,
}: {
  projeto: { id: string; codigo: string; nome: string };
  disciplinas: ArvoreDisciplina[];
  geral: ArquivoProjetoItem[];
  podeGerirGeral: boolean;
  nomenclatura: { exigir: boolean; padrao: string | null };
}) {
  const [renomeando, setRenomeando] = useState<ArvoreArquivoItem | null>(null);
  const totais = useMemo(() => {
    const todos = disciplinas.flatMap((d) => d.arquivos);
    return { total: todos.length + geral.length, aprovados: todos.filter((a) => a.aprovado).length };
  }, [disciplinas, geral]);

  const enviaveis = disciplinas.filter((d) => d.podeEnviar);
  const temGeral = geral.length > 0 || podeGerirGeral;
  const vazio = totais.total === 0 && !podeGerirGeral && disciplinas.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/projetos/${projeto.id}`} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3" /> {formatarCodigo(projeto.codigo)} · {projeto.nome}
          </Link>
          <h2 className="text-2xl font-extrabold tracking-tight">Arquivos do projeto</h2>
          <p className="text-sm text-muted-foreground">
            Organizados por disciplina e tipo de arquivo. {totais.aprovados} de {totais.total} aprovado(s).
          </p>
        </div>
      </div>

      {enviaveis.length > 0 && <Uploader disciplinas={enviaveis} nomenclatura={nomenclatura} />}

      <Card>
        <CardContent className="p-2">
          {vazio ? (
            <EmptyState
              icon={FolderOpen}
              title="Nenhum arquivo"
              description="Envie arquivos pelo painel da disciplina ou pelo formulário acima."
            />
          ) : (
            <div className="divide-y">
              {temGeral && <PastaGeral projetoId={projeto.id} geral={geral} podeGerir={podeGerirGeral} />}

              {disciplinas.map((d) => {
                const grupos = agruparPorPacote(d.arquivos);
                return (
                  <Pasta
                    key={d.id}
                    nome={d.nome}
                    contagem={d.arquivos.length}
                    nivel={0}
                    acao={
                      d.arquivos.length > 0 ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label={`Baixar ${d.nome} como .zip`}
                          title="Baixar pasta (.zip)"
                          render={<a href={`/api/uploads/disciplina/${d.id}/zip`} />}
                        >
                          <FileArchive className="size-3.5" />
                        </Button>
                      ) : undefined
                    }
                  >
                    {grupos.length === 0 ? (
                      <p className="py-1.5 pl-10 text-xs text-muted-foreground">Sem arquivos.</p>
                    ) : (
                      grupos.map((g) => (
                        <Pasta key={g.pacote} nome={PACOTE_LABEL[g.pacote]} contagem={g.total} nivel={1}>
                          {g.subpastas.map((s) => (
                            <Pasta key={s.nome} nome={s.nome} contagem={s.arquivos.length} nivel={2} abertoInicial>
                              {s.arquivos.map((a) => (
                                <LinhaArquivo
                                  key={a.id}
                                  a={a}
                                  nivel={3}
                                  onRenomear={d.podeEnviar ? setRenomeando : undefined}
                                  foraPadrao={
                                    nomenclatura.exigir && a.pacote === "A" && foraDoPadrao(a.nome, nomenclatura.padrao)
                                  }
                                />
                              ))}
                            </Pasta>
                          ))}
                        </Pasta>
                      ))
                    )}
                  </Pasta>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <RenomearDialog item={renomeando} onClose={() => setRenomeando(null)} />
    </div>
  );
}

// ── Pasta "Geral": repositório ArquivoProjeto (gated por permissão arquivos_gerais) ──

type Meta = { caminho: string; nomeArquivo: string; mime: string; tamanho: number; hashSha256: string };

async function enviarArquivoGeral(file: File): Promise<Meta> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/projetos/arquivos", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Falha no upload.");
  return json as Meta;
}

function PastaGeral({
  projetoId,
  geral,
  podeGerir,
}: {
  projetoId: string;
  geral: ArquivoProjetoItem[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<ArquivoProjetoItem | null>(null);
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
      const meta = await enviarArquivoGeral(file);
      const r = await criarArquivo({ projetoId, nome: form.nome, categoria: form.categoria, descricao: form.descricao, meta });
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
      const meta = await enviarArquivoGeral(file);
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
    <>
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
      <Pasta
        nome="Geral"
        contagem={geral.length}
        nivel={0}
        abertoInicial
        acao={
          podeGerir ? (
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={abrirNovo}>
              <Plus className="size-3.5" /> Novo
            </Button>
          ) : undefined
        }
      >
        {geral.length === 0 ? (
          <p className="py-1.5 pl-10 text-xs text-muted-foreground">Sem arquivos gerais.</p>
        ) : (
          geral.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 rounded-sm py-1 pr-2 text-sm hover:bg-muted/40"
              style={{ paddingLeft: "1.75rem" }}
            >
              <IconeArquivo nome={a.atual?.nomeArquivo ?? a.nome} />
              <span className="min-w-0 flex-1 truncate" title={a.nome}>
                {a.nome}
                {a.atual && a.atual.numero > 1 && (
                  <span className="ml-1 font-mono text-xs text-muted-foreground">v{a.atual.numero}</span>
                )}
              </span>
              {a.categoria && (
                <Badge variant="outline" className="shrink-0 capitalize">
                  {a.categoria}
                </Badge>
              )}
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {a.atual ? fmtBytes(a.atual.tamanho) : "—"}
              </span>
              {a.atual && (
                <a
                  href={`/api/projetos/arquivos/${a.atual.id}/download`}
                  className="shrink-0 text-primary hover:text-primary/80"
                  aria-label={`Baixar ${a.nome}`}
                >
                  <Download className="size-3.5" />
                </a>
              )}
              {podeGerir && (
                <>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    aria-label="Nova versão"
                    title="Enviar nova versão"
                    disabled={busy}
                    onClick={() => {
                      setAlvoVersao(a.id);
                      fileVersao.current?.click();
                    }}
                  >
                    <UploadIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Editar"
                    onClick={() => abrirEditar(a)}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                    aria-label="Excluir"
                    disabled={pending}
                    onClick={() => excluir(a.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </Pasta>

      {/* Novo arquivo geral */}
      <Dialog open={novo} onOpenChange={(o) => !o && setNovo(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo arquivo geral</DialogTitle>
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
                  {CATEGORIAS_GERAL.map((c) => (
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
                  {CATEGORIAS_GERAL.map((c) => (
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
    </>
  );
}

// ── Uploader: pasta inteira / múltiplos / arrastar, 1 disciplina por envio ──

type PacoteEnvio = "A" | "B" | "RECEBIDOS";
const REGEX_CLIENTE = /^(clientes?|recebidos?|do[-_ ]?cliente)$/i;

type ItemEnvio = { file: File; nome: string; alvo: PacoteEnvio; fora: boolean };

// ── Estado de progresso por arquivo (feedback visual do envio) ──
type StatusEnvio = "pendente" | "enviando" | "ok" | "erro";
type LinhaEnvio = ItemEnvio & {
  status: StatusEnvio;
  progresso: number; // 0–100
  motivo?: string;
  realocado?: boolean;
};

type ResultadoUpload = { nome: string; ok: boolean; realocado?: boolean; motivo?: string };

/**
 * Envia UM arquivo via XHR para expor `upload.onprogress` (fetch não reporta
 * progresso de upload). Resolve com o resultado do servidor; rejeita em falha
 * de rede/HTTP com mensagem amigável.
 */
function enviarUm(
  item: ItemEnvio,
  disciplinaId: string,
  onProgress: (pct: number) => void,
): Promise<ResultadoUpload> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.set("disciplinaId", disciplinaId);
    fd.set("pacote", item.alvo);
    fd.append("files", item.file);
    fd.append("nomes", item.nome); // renomeia no ato do upload

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: { error?: string; resultados?: ResultadoUpload[] } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.resultados?.[0]) {
        resolve(data.resultados[0]);
      } else {
        reject(
          new Error(
            data?.error ??
              (xhr.status === 413
                ? `Arquivo muito grande — limite de ${TAMANHO_MAX_LABEL}.`
                : `Falha no envio (HTTP ${xhr.status}).`),
          ),
        );
      }
    };
    xhr.onerror = () =>
      reject(new Error("Falha de rede durante o envio — verifique a conexão."));
    xhr.send(fd);
  });
}

function patchLinha(
  lista: LinhaEnvio[],
  i: number,
  patch: Partial<LinhaEnvio>,
): LinhaEnvio[] {
  const copia = lista.slice();
  copia[i] = { ...copia[i], ...patch };
  return copia;
}

function Uploader({
  disciplinas,
  nomenclatura,
}: {
  disciplinas: { id: string; nome: string }[];
  nomenclatura: { exigir: boolean; padrao: string | null };
}) {
  const router = useRouter();
  const [disciplinaId, setDisciplinaId] = useState(disciplinas[0]?.id ?? "");
  const [pacote, setPacote] = useState<PacoteEnvio>("A");
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [pendentes, setPendentes] = useState<ItemEnvio[] | null>(null);
  const [progresso, setProgresso] = useState<LinhaEnvio[] | null>(null);
  const inputArquivos = useRef<HTMLInputElement>(null);
  const inputPasta = useRef<HTMLInputElement>(null);

  function alvoDe(f: File): PacoteEnvio {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
    const ehCliente = rel.split("/").slice(0, -1).some((s) => REGEX_CLIENTE.test(s.trim()));
    return ehCliente ? "RECEBIDOS" : pacote;
  }

  function enviar(lista: FileList | File[] | null) {
    if (!disciplinaId) {
      toast.error("Selecione a disciplina.");
      return;
    }
    const files = lista ? Array.from(lista) : [];
    if (files.length === 0) return;

    // Filtra tamanho antes de enviar (evita estourar o corpo da requisição).
    const aceitos = files.filter((f) => {
      if (f.size > TAMANHO_MAX) {
        toast.error(`${f.name}: excede o limite de ${TAMANHO_MAX_LABEL}.`);
        return false;
      }
      return true;
    });
    if (aceitos.length === 0) return;

    const itens: ItemEnvio[] = aceitos.map((f) => {
      const alvo = alvoDe(f);
      const fora = nomenclatura.exigir && alvo === "A" && foraDoPadrao(f.name, nomenclatura.padrao);
      return { file: f, nome: f.name, alvo, fora };
    });

    // Nome fora do padrão em Pranchas → revisa antes (renomear no ato ou manter).
    if (itens.some((i) => i.fora)) {
      setPendentes(itens);
      return;
    }
    void uploadFinal(itens);
  }

  async function uploadFinal(itens: ItemEnvio[]) {
    setPendentes(null);
    // Envia arquivo a arquivo (XHR) para exibir a lista e o progresso de cada um.
    const linhas: LinhaEnvio[] = itens.map((it) => ({ ...it, status: "pendente", progresso: 0 }));
    setProgresso(linhas);
    setEnviando(true);
    try {
      let ok = 0;
      let realocados = 0;
      for (let i = 0; i < linhas.length; i++) {
        setProgresso((prev) => (prev ? patchLinha(prev, i, { status: "enviando" }) : prev));
        try {
          const r = await enviarUm(linhas[i], disciplinaId, (pct) =>
            setProgresso((prev) => (prev ? patchLinha(prev, i, { progresso: pct }) : prev)),
          );
          if (r.ok) {
            ok += 1;
            if (r.realocado) realocados += 1;
            setProgresso((prev) =>
              prev ? patchLinha(prev, i, { status: "ok", progresso: 100, realocado: r.realocado }) : prev,
            );
          } else {
            setProgresso((prev) =>
              prev ? patchLinha(prev, i, { status: "erro", motivo: r.motivo ?? "Falha ao salvar." }) : prev,
            );
          }
        } catch (e) {
          setProgresso((prev) =>
            prev ? patchLinha(prev, i, { status: "erro", motivo: (e as Error).message }) : prev,
          );
        }
      }
      if (ok > 0) toast.success(`${ok} arquivo(s) enviado(s).`);
      if (realocados > 0) toast.info(`${realocados} arquivo(s) não suportado(s) foram para "Outros".`);
      router.refresh();
    } finally {
      setEnviando(false);
      if (inputArquivos.current) inputArquivos.current.value = "";
      if (inputPasta.current) inputPasta.current.value = "";
    }
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-sm border border-dashed p-3 transition-colors",
        arrastando && "border-primary bg-primary/5",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        if (e.dataTransfer.files.length) enviar(e.dataTransfer.files);
      }}
    >
      <RevisarNomesDialog
        itens={pendentes}
        onCancel={() => setPendentes(null)}
        onChange={setPendentes}
        onConfirm={() => pendentes && uploadFinal(pendentes)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={disciplinaId} onValueChange={(v) => v && setDisciplinaId(v)}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Disciplina" />
          </SelectTrigger>
          <SelectContent>
            {disciplinas.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={pacote} onValueChange={(v) => v && setPacote(v as PacoteEnvio)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="A">Pranchas e arquivos</SelectItem>
            <SelectItem value="B">Backup do modelo</SelectItem>
            <SelectItem value="RECEBIDOS">Recebidos do cliente</SelectItem>
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" disabled={enviando} onClick={() => inputArquivos.current?.click()}>
          <UploadIcon className="size-3.5" /> Arquivos
        </Button>
        <Button size="sm" variant="outline" disabled={enviando} onClick={() => inputPasta.current?.click()}>
          <FolderOpen className="size-3.5" /> Pasta
        </Button>

        <input ref={inputArquivos} type="file" multiple className="hidden" onChange={(e) => enviar(e.target.files)} />
        {/* Seletor de pasta inteira: webkitdirectory preserva subpastas via webkitRelativePath.
            Atributos não-padrão passados via spread (o TS não os tem no tipo do input). */}
        <input
          ref={inputPasta}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => enviar(e.target.files)}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
      </div>

      {progresso && progresso.length > 0 && (
        <PainelProgresso
          linhas={progresso}
          enviando={enviando}
          onFechar={() => setProgresso(null)}
        />
      )}

      <p className="text-xs text-muted-foreground">
        Envie arquivos soltos ou uma pasta inteira (ou arraste aqui). Vai para a disciplina escolhida; subpastas
        chamadas <span className="font-medium">Cliente</span>/<span className="font-medium">Recebidos</span> vão para
        &quot;Recebidos do cliente&quot;. Formatos não suportados em Pranchas vão para &quot;Outros&quot;.
        {nomenclatura.exigir && " Nomes fora do padrão em Pranchas pedem revisão antes do envio."}
      </p>
    </div>
  );
}

// ── Painel de progresso: lista de arquivos + status/barra por arquivo ──

function IconeStatus({ status }: { status: StatusEnvio }) {
  if (status === "ok") return <CheckCircle2 className="size-3.5 shrink-0 text-success" />;
  if (status === "erro") return <XCircle className="size-3.5 shrink-0 text-destructive" />;
  if (status === "enviando") return <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />;
  return <Clock className="size-3.5 shrink-0 text-muted-foreground" />;
}

function PainelProgresso({
  linhas,
  enviando,
  onFechar,
}: {
  linhas: LinhaEnvio[];
  enviando: boolean;
  onFechar: () => void;
}) {
  const feitos = linhas.filter((l) => l.status === "ok" || l.status === "erro").length;
  const erros = linhas.filter((l) => l.status === "erro").length;
  return (
    <div className="rounded-sm border bg-background/60 p-2">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-xs font-medium">
          {enviando ? "Enviando" : "Envio concluído"} · {feitos}/{linhas.length}
          {erros > 0 && <span className="ml-1 text-destructive">({erros} com erro)</span>}
        </span>
        {!enviando && (
          <button
            type="button"
            onClick={onFechar}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Fechar
          </button>
        )}
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {linhas.map((l, i) => (
          <div key={i} className="flex items-center gap-2 rounded-sm px-1 py-1">
            <IconeArquivo nome={l.nome} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs" title={l.nome}>
                  {l.nome}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {fmtBytes(l.file.size)}
                </span>
                <IconeStatus status={l.status} />
              </div>
              {(l.status === "enviando" || l.status === "pendente") && (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${l.progresso}%` }}
                  />
                </div>
              )}
              {l.status === "erro" && l.motivo && (
                <p className="mt-0.5 text-[11px] text-destructive">{l.motivo}</p>
              )}
              {l.status === "ok" && l.realocado && (
                <p className="mt-0.5 text-[11px] text-warning">
                  Formato não suportado — enviado para &quot;Outros&quot;.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RevisarNomesDialog({
  itens,
  onCancel,
  onChange,
  onConfirm,
}: {
  itens: ItemEnvio[] | null;
  onCancel: () => void;
  onChange: (itens: ItemEnvio[]) => void;
  onConfirm: () => void;
}) {
  const fora = itens ? itens.map((it, i) => ({ it, i })).filter((x) => x.it.fora) : [];
  return (
    <Dialog open={!!itens} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nomes fora do padrão</DialogTitle>
          <DialogDescription>
            {fora.length} arquivo(s) de Pranchas fora do padrão{" "}
            <span className="font-mono">{"{proj}-{disc}-{fase}-{nº}-{tipo}[-Rnn]"}</span>. Renomeie agora ou envie
            assim (ficam com alerta na lista).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {fora.map(({ it, i }) => (
            <div key={i} className="space-y-1">
              <Label className="truncate text-xs text-muted-foreground">{it.file.name}</Label>
              <Input
                value={it.nome}
                className="font-mono text-xs"
                onChange={(e) => {
                  if (!itens) return;
                  const copia = itens.slice();
                  copia[i] = { ...copia[i], nome: e.target.value };
                  onChange(copia);
                }}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={onConfirm}>Enviar {itens?.length ?? 0} arquivo(s)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
