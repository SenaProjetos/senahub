"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, useTransition } from "react";
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
  Eye,
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
} from "@/modules/projetos/arquivos/queries";
import { renomearUpload } from "@/modules/uploads/actions";
import {
  criarDocumento,
  editarDocumento,
  adicionarVersaoDocumento,
  excluirDocumento,
} from "@/modules/documentos-cliente/actions";
import type { DocumentoItem } from "@/modules/documentos-cliente/queries";
import type { MetaDocumento } from "@/modules/documentos-cliente/schemas";
import { entregaveisAtuais } from "@/modules/uploads/validacao";
import { AcoesValidacaoArquivo } from "@/components/projetos/acoes-validacao-arquivo";
import { formatarCodigo } from "@/modules/projetos/numbering";
import {
  TAMANHO_MAX_LABEL,
  TAMANHO_MAX_BACKUP_LABEL,
  limiteDoPacote,
  limiteLabelDoPacote,
} from "@/modules/uploads/limites";
import { cn, formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

// ── Pacotes por disciplina. "Recebidos do cliente" saiu daqui: virou repositório
// de Documento ancorado no cliente/projeto (ver RecebidosPasta). ──
const PACOTES = ["A", "B", "OUTROS"] as const;
type Pacote = (typeof PACOTES)[number];
const PACOTE_LABEL: Record<Pacote, string> = {
  A: "Pranchas e arquivos",
  B: "Backup do modelo",
  OUTROS: "Outros (não suportados)",
};

const CATEGORIAS_GERAL = ["contrato", "planta", "memorial", "foto", "administrativo", "outro"] as const;

export function extDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i >= 0 ? nome.slice(i + 1).toLowerCase() : "";
}
/** Separa nome em base + extensão (com o ponto, no case original). `.env`/sem ponto → sem extensão. */
function separarExt(nome: string): { base: string; ext: string } {
  const i = nome.lastIndexOf(".");
  return i > 0 ? { base: nome.slice(0, i), ext: nome.slice(i) } : { base: nome, ext: "" };
}
function subpastaDe(nome: string): Subpasta {
  return EXT_SUBPASTA[extDe(nome)] ?? "Outros arquivos";
}
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
export function IconeArquivo({ nome }: { nome: string }) {
  const ext = extDe(nome);
  if (ext === "pdf") return <FileText className="size-4 shrink-0 text-destructive" />;
  if (["dwg", "dxf", "dwf"].includes(ext)) return <FileCode className="size-4 shrink-0 text-primary" />;
  if (["xls", "xlsx", "doc", "docx", "txt"].includes(ext)) return <FileSpreadsheet className="size-4 shrink-0 text-success" />;
  if (["ifc", "ifcxml", "ifczip"].includes(ext)) return <FileCode className="size-4 shrink-0 text-violet-500" />;
  if (["zip", "rar", "7z", "tqs", "rvt", "skp", "qibzip"].includes(ext)) return <FileArchive className="size-4 shrink-0 text-warning" />;
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return <ImageIcon className="size-4 shrink-0 text-pink-500" />;
  return <FileIcon className="size-4 shrink-0 text-muted-foreground" />;
}

/** Status de validação de um entregável (aprovado / ajuste solicitado / pendente). Compartilhado com o card da disciplina. */
export function StatusArquivo({
  aprovado,
  ajusteObs,
  dataAprovacao,
}: {
  aprovado: boolean;
  ajusteObs?: string | null;
  dataAprovacao?: string | null;
}) {
  if (aprovado) {
    return (
      <span
        className="flex shrink-0 items-center gap-1 text-xs text-status-aprovado"
        title={dataAprovacao ? `Aprovado · ${formatarData(dataAprovacao)}` : "Aprovado"}
      >
        <CheckCircle2 className="size-3.5" /> aprovado
      </span>
    );
  }
  if (ajusteObs) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs text-warning" title={`Ajuste solicitado: ${ajusteObs}`}>
        <AlertTriangle className="size-3.5" /> ajuste
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Aguardando validação">
      <Clock className="size-3.5" /> pendente
    </span>
  );
}

// ── Download zipado (subpasta / seleção) — dispara GET streaming em /api/uploads/zip ──
function baixarZipIds(ids: string[], nome: string) {
  if (ids.length === 0) return;
  const qs = new URLSearchParams({ ids: ids.join(","), nome });
  const a = document.createElement("a");
  a.href = `/api/uploads/zip?${qs.toString()}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Seleção múltipla de arquivos (por upload id), compartilhada via contexto. */
const SelecaoCtx = createContext<{ sel: Set<string>; alternar: (id: string) => void } | null>(null);

/** Botão de download zipado para uma pasta/subpasta (recebe os ids que contém). */
function ZipButton({ ids, nome, title }: { ids: string[]; nome: string; title: string }) {
  if (ids.length === 0) return null;
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-7"
      aria-label={title}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        baixarZipIds(ids, nome);
      }}
    >
      <FileArchive className="size-3.5" />
    </Button>
  );
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
  projetoId,
  onRenomear,
  podeValidar,
  foraPadrao,
}: {
  a: ArvoreArquivoItem;
  nivel: number;
  projetoId: string;
  onRenomear?: (a: ArvoreArquivoItem) => void;
  podeValidar?: boolean;
  foraPadrao?: boolean;
}) {
  const selecao = useContext(SelecaoCtx);
  const ehPdf = extDe(a.nome) === "pdf";
  return (
    <div
      className="flex items-center gap-2 rounded-sm py-1 pr-2 text-sm hover:bg-muted/40"
      style={{ paddingLeft: `${nivel * 1.25 + 0.75}rem` }}
    >
      {selecao && (
        <Checkbox
          className="shrink-0"
          checked={selecao.sel.has(a.id)}
          onCheckedChange={() => selecao.alternar(a.id)}
          aria-label={`Selecionar ${a.nome}`}
        />
      )}
      <IconeArquivo nome={a.nome} />
      {ehPdf ? (
        <a
          href={`/projetos/${projetoId}/arquivos/${a.id}/visualizar`}
          target="_blank"
          rel="noopener"
          className="min-w-0 flex-1 truncate hover:text-primary hover:underline"
          title={`Visualizar ${a.nome}`}
        >
          {a.nome}
          {a.versao > 1 && <span className="ml-1 font-mono text-xs text-muted-foreground">v{a.versao}</span>}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate" title={a.nome}>
          {a.nome}
          {a.versao > 1 && <span className="ml-1 font-mono text-xs text-muted-foreground">v{a.versao}</span>}
        </span>
      )}
      {foraPadrao && (
        <span
          className="flex shrink-0 items-center gap-1 text-xs text-warning"
          title="Nome fora do padrão da Lista Mestre — renomeie para o padrão {proj}-{disc}-{fase}-{nº}-{tipo}."
        >
          <AlertTriangle className="size-3.5" /> fora do padrão
        </span>
      )}
      <StatusArquivo aprovado={a.aprovado} ajusteObs={a.ajusteObs} dataAprovacao={a.data} />
      {podeValidar && (
        <AcoesValidacaoArquivo uploadId={a.id} nomeArquivo={a.nome} validado={a.aprovado} />
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
      {ehPdf && (
        <a
          href={`/projetos/${projetoId}/arquivos/${a.id}/visualizar`}
          target="_blank"
          rel="noopener"
          className="shrink-0 text-primary hover:text-primary/80"
          aria-label={`Visualizar ${a.nome}`}
          title="Visualizar prancha"
        >
          <Eye className="size-3.5" />
        </a>
      )}
      <a href={a.downloadUrl} className="shrink-0 text-primary hover:text-primary/80" aria-label={`Baixar ${a.nome}`}>
        <Download className="size-3.5" />
      </a>
    </div>
  );
}

function RenomearDialog({ item, onClose }: { item: ArvoreArquivoItem | null; onClose: () => void }) {
  const router = useRouter();
  const [base, setBase] = useState("");
  const [ext, setExt] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (item && item.id !== lastId) {
    setLastId(item.id);
    const s = separarExt(item.nome);
    setBase(s.base);
    setExt(s.ext);
  }

  function salvar() {
    if (!item || !base.trim()) return;
    const nome = base.trim() + ext; // extensão preservada
    start(async () => {
      const r = await renomearUpload({ uploadId: item.id, nome });
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
          <div className="flex items-center gap-1">
            <Input
              value={base}
              onChange={(e) => setBase(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && salvar()}
              className="flex-1"
              autoFocus
            />
            {ext && (
              <span className="shrink-0 rounded-sm border bg-muted px-2 py-2 font-mono text-sm text-muted-foreground">
                {ext}
              </span>
            )}
          </div>
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
  podeValidar,
  nomenclatura,
  recebidos,
  clienteId,
  podeGerirRecebidos,
}: {
  projeto: { id: string; codigo: string; nome: string };
  disciplinas: ArvoreDisciplina[];
  geral: DocumentoItem[];
  podeGerirGeral: boolean;
  podeValidar: boolean;
  nomenclatura: { exigir: boolean; padrao: string | null };
  recebidos: DocumentoItem[];
  clienteId: string | null;
  podeGerirRecebidos: boolean;
}) {
  const [renomeando, setRenomeando] = useState<ArvoreArquivoItem | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const totais = useMemo(() => {
    const todos = disciplinas.flatMap((d) => d.arquivos);
    return { total: todos.length + geral.length, aprovados: todos.filter((a) => a.aprovado).length };
  }, [disciplinas, geral]);

  const alternar = useCallback((id: string) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);
  const ctxSelecao = useMemo(() => ({ sel, alternar }), [sel, alternar]);

  const enviaveis = disciplinas.filter((d) => d.podeEnviar);
  const temGeral = geral.length > 0 || podeGerirGeral;
  const temRecebidos = recebidos.length > 0 || podeGerirRecebidos;
  const vazio = totais.total === 0 && !podeGerirGeral && !temRecebidos && disciplinas.length === 0;

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

      {sel.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-sm border bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
          <span className="text-sm font-medium">{sel.size} arquivo(s) selecionado(s)</span>
          <Button size="sm" onClick={() => baixarZipIds([...sel], `${projeto.codigo}-selecao`)}>
            <Download className="size-3.5" /> Baixar .zip
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      <SelecaoCtx.Provider value={ctxSelecao}>
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
                {temRecebidos && (
                  <RecebidosPasta
                    projetoId={projeto.id}
                    clienteId={clienteId}
                    recebidos={recebidos}
                    podeGerir={podeGerirRecebidos}
                  />
                )}
                {temGeral && (
                  <PastaGeral projetoId={projeto.id} clienteId={clienteId} geral={geral} podeGerir={podeGerirGeral} />
                )}

                {disciplinas.map((d) => {
                  const grupos = agruparPorPacote(d.arquivos);
                  // Entregáveis na versão atual (pacote A/B, origem manual) → só eles validam.
                  const idsValidaveis = new Set(
                    entregaveisAtuais(
                      d.arquivos.map((a) => ({
                        id: a.id,
                        pacote: a.pacote,
                        nomeArquivo: a.nome,
                        versao: a.versao,
                        validado: a.aprovado,
                        origem: a.origem,
                      })),
                    ).map((u) => u.id),
                  );
                  const podeValidarDisc = podeValidar && !d.finalizado;
                  return (
                    <Pasta
                      key={d.id}
                      nome={d.nome}
                      contagem={d.arquivos.length}
                      nivel={0}
                      acao={
                        <div className="flex items-center gap-2">
                          {podeValidar && d.resumo.total > 0 && (
                            <span
                              className={cn(
                                "font-mono text-[10px]",
                                d.resumo.completo ? "text-status-aprovado" : "text-muted-foreground",
                              )}
                              title={`${d.resumo.validados} de ${d.resumo.total} arquivo(s) validado(s)`}
                            >
                              {d.resumo.validados}/{d.resumo.total} val.
                            </span>
                          )}
                          {d.arquivos.length > 0 && (
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
                          )}
                        </div>
                      }
                    >
                      {grupos.length === 0 ? (
                        <p className="py-1.5 pl-10 text-xs text-muted-foreground">Sem arquivos.</p>
                      ) : (
                        grupos.map((g) => {
                          const idsPacote = g.subpastas.flatMap((s) => s.arquivos.map((a) => a.id));
                          return (
                            <Pasta
                              key={g.pacote}
                              nome={PACOTE_LABEL[g.pacote]}
                              contagem={g.total}
                              nivel={1}
                              acao={
                                <ZipButton
                                  ids={idsPacote}
                                  nome={`${projeto.codigo}-${d.nome}-${PACOTE_LABEL[g.pacote]}`}
                                  title={`Baixar "${PACOTE_LABEL[g.pacote]}" (.zip)`}
                                />
                              }
                            >
                              {g.subpastas.map((s) => (
                                <Pasta
                                  key={s.nome}
                                  nome={s.nome}
                                  contagem={s.arquivos.length}
                                  nivel={2}
                                  abertoInicial
                                  acao={
                                    <ZipButton
                                      ids={s.arquivos.map((a) => a.id)}
                                      nome={`${projeto.codigo}-${d.nome}-${s.nome}`}
                                      title={`Baixar "${s.nome}" (.zip)`}
                                    />
                                  }
                                >
                                  {s.arquivos.map((a) => (
                                    <LinhaArquivo
                                      key={a.id}
                                      a={a}
                                      nivel={3}
                                      projetoId={projeto.id}
                                      onRenomear={d.podeEnviar ? setRenomeando : undefined}
                                      podeValidar={podeValidarDisc && idsValidaveis.has(a.id)}
                                      foraPadrao={
                                        nomenclatura.exigir && a.pacote === "A" && foraDoPadrao(a.nome, nomenclatura.padrao)
                                      }
                                    />
                                  ))}
                                </Pasta>
                              ))}
                            </Pasta>
                          );
                        })
                      )}
                    </Pasta>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </SelecaoCtx.Provider>

      <RenomearDialog item={renomeando} onClose={() => setRenomeando(null)} />
    </div>
  );
}

// ── Pasta "Recebidos do cliente": Documentos ancorados no projeto + herdados da proposta ──

async function subirDocumento(
  file: File,
  projetoId: string,
  clienteId: string | null,
  origem?: "recebido_cliente" | "interno",
): Promise<MetaDocumento> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("projetoId", projetoId);
  if (clienteId) fd.append("clienteId", clienteId);
  if (origem) fd.append("origem", origem);
  const res = await fetch("/api/documentos", { method: "POST", body: fd });
  const meta = await res.json();
  if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
  return meta as MetaDocumento;
}

function RecebidosPasta({
  projetoId,
  clienteId,
  recebidos,
  podeGerir,
}: {
  projetoId: string;
  clienteId: string | null;
  recebidos: DocumentoItem[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const fileNovo = useRef<HTMLInputElement>(null);
  const fileVersao = useRef<HTMLInputElement>(null);
  const [alvoVersao, setAlvoVersao] = useState<string | null>(null);

  async function enviarNovos(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    try {
      let ok = 0;
      for (const file of files) {
        try {
          const meta = await subirDocumento(file, projetoId, clienteId);
          const r = await criarDocumento({ projetoId, nome: file.name, origem: "recebido_cliente", meta });
          if (r.ok) ok += 1;
          else toast.error(`${file.name}: ${r.error}`);
        } catch (e) {
          toast.error(`${file.name}: ${(e as Error).message}`);
        }
      }
      if (ok > 0) toast.success(`${ok} documento(s) recebido(s).`);
      router.refresh();
    } finally {
      setBusy(false);
      if (fileNovo.current) fileNovo.current.value = "";
    }
  }

  async function enviarVersao(documentoId: string, file: File) {
    setBusy(true);
    try {
      const meta = await subirDocumento(file, projetoId, clienteId);
      const r = await adicionarVersaoDocumento({ documentoId, meta });
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
      const r = await excluirDocumento({ id });
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
        nome="Recebidos do cliente"
        contagem={recebidos.length}
        nivel={0}
        abertoInicial
        acao={
          podeGerir ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              disabled={busy}
              onClick={() => fileNovo.current?.click()}
            >
              <UploadIcon className="size-3.5" /> {busy ? "Enviando…" : "Enviar"}
            </Button>
          ) : undefined
        }
      >
        <input
          ref={fileNovo}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => enviarNovos(Array.from(e.target.files ?? []))}
        />
        {recebidos.length === 0 ? (
          <p className="py-1.5 pl-10 text-xs text-muted-foreground">
            Material enviado pelo cliente (proposta/projeto). Nada recebido ainda.
          </p>
        ) : (
          recebidos.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-2 rounded-sm py-1 pr-2 text-sm hover:bg-muted/40"
              style={{ paddingLeft: "1.75rem" }}
            >
              <IconeArquivo nome={d.atual?.nomeArquivo ?? d.nome} />
              <span className="min-w-0 flex-1 truncate" title={d.nome}>
                {d.nome}
                {d.totalVersoes > 1 && <span className="ml-1 font-mono text-xs text-muted-foreground">v{d.atual?.numero}</span>}
              </span>
              {d.canal !== "interno" && (
                <Badge variant="outline" className="shrink-0 capitalize">{d.canal}</Badge>
              )}
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {d.atual ? fmtBytes(d.atual.tamanho) : "—"}
              </span>
              {d.atual && (
                <a href={d.atual.downloadUrl} className="shrink-0 text-primary hover:text-primary/80" aria-label={`Baixar ${d.nome}`}>
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
                      setAlvoVersao(d.id);
                      fileVersao.current?.click();
                    }}
                  >
                    <UploadIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                    aria-label="Excluir"
                    disabled={pending}
                    onClick={() => excluir(d.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </Pasta>
    </>
  );
}

// ── Pasta "Geral": Documento(origem=interno), gated por `arquivos_gerais` (Fase 5a) ──

function PastaGeral({
  projetoId,
  clienteId,
  geral,
  podeGerir,
}: {
  projetoId: string;
  clienteId: string | null;
  geral: DocumentoItem[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<DocumentoItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ nome: "", categoria: "outro", descricao: "" });
  const fileNovo = useRef<HTMLInputElement>(null);
  const fileVersao = useRef<HTMLInputElement>(null);
  const [alvoVersao, setAlvoVersao] = useState<string | null>(null);

  function abrirNovo() {
    setForm({ nome: "", categoria: "outro", descricao: "" });
    setNovo(true);
  }
  function abrirEditar(a: DocumentoItem) {
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
      const meta = await subirDocumento(file, projetoId, clienteId, "interno");
      const r = await criarDocumento({ projetoId, nome: form.nome, categoria: form.categoria, descricao: form.descricao, origem: "interno", meta });
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
      const r = await editarDocumento({ id: editar.id, nome: form.nome, categoria: form.categoria, descricao: form.descricao });
      if (r.ok) {
        toast.success("Arquivo atualizado.");
        setEditar(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function enviarVersao(documentoId: string, file: File) {
    setBusy(true);
    try {
      const meta = await subirDocumento(file, projetoId, clienteId, "interno");
      const r = await adicionarVersaoDocumento({ documentoId, meta });
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
      const r = await excluirDocumento({ id });
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
                  href={a.atual.downloadUrl}
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

type PacoteEnvio = "A" | "B";

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
                ? `Arquivo muito grande — limite de ${limiteLabelDoPacote(item.alvo)}.`
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
  // Sem disciplina pré-selecionada: força a escolha consciente e evita envio no alvo errado.
  const [disciplinaId, setDisciplinaId] = useState("");
  const [pacote, setPacote] = useState<PacoteEnvio>("A");
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [pendentes, setPendentes] = useState<ItemEnvio[] | null>(null);
  const [progresso, setProgresso] = useState<LinhaEnvio[] | null>(null);
  const inputArquivos = useRef<HTMLInputElement>(null);
  const inputPasta = useRef<HTMLInputElement>(null);

  function enviar(lista: FileList | File[] | null) {
    if (!disciplinaId) {
      toast.error("Selecione a disciplina.");
      return;
    }
    const files = lista ? Array.from(lista) : [];
    if (files.length === 0) return;

    // Todos os arquivos vão para o pacote escolhido. Filtra por tamanho conforme o
    // limite desse pacote (B/backup = 1,5 GB; demais = 500 MB) antes de enviar.
    const itens: ItemEnvio[] = [];
    for (const f of files) {
      const alvo = pacote;
      if (f.size > limiteDoPacote(alvo)) {
        toast.error(`${f.name}: excede o limite de ${limiteLabelDoPacote(alvo)}.`);
        continue;
      }
      const fora = nomenclatura.exigir && alvo === "A" && foraDoPadrao(f.name, nomenclatura.padrao);
      itens.push({ file: f, nome: f.name, alvo, fora });
    }
    if (itens.length === 0) return;

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

      <div className="flex items-center gap-2">
        <UploadIcon className="size-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold leading-none">Enviar arquivos</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Escolha a disciplina e o tipo, depois selecione os arquivos ou a pasta.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={disciplinaId} onValueChange={(v) => v && setDisciplinaId(v)}>
          <SelectTrigger className={cn("w-52", !disciplinaId && "text-muted-foreground")}>
            <SelectValue placeholder="Selecione a disciplina…" />
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
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" disabled={enviando || !disciplinaId} onClick={() => inputArquivos.current?.click()}>
          <UploadIcon className="size-3.5" /> Arquivos
        </Button>
        <Button size="sm" variant="outline" disabled={enviando || !disciplinaId} onClick={() => inputPasta.current?.click()}>
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
        Envie arquivos soltos ou uma pasta inteira (ou arraste aqui). Vai para a disciplina escolhida.
        Formatos não suportados em Pranchas vão para &quot;Outros&quot;. Material enviado pelo cliente fica em
        &quot;Recebidos do cliente&quot; (pasta de topo).
        {" "}Limite por arquivo: {TAMANHO_MAX_BACKUP_LABEL} em Backup do modelo, {TAMANHO_MAX_LABEL} nos demais.
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
  const foraCount = itens ? itens.filter((it) => it.fora).length : 0;

  function renomear(i: number, nome: string) {
    if (!itens) return;
    const copia = itens.slice();
    copia[i] = { ...copia[i], nome };
    onChange(copia);
  }
  function remover(i: number) {
    if (!itens) return;
    const copia = itens.slice();
    copia.splice(i, 1);
    if (copia.length === 0) onCancel(); // nada a enviar → fecha
    else onChange(copia);
  }

  return (
    <Dialog open={!!itens} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Revisar envio</DialogTitle>
          <DialogDescription>
            {foraCount} arquivo(s) de Pranchas fora do padrão{" "}
            <span className="font-mono">{"{proj}-{disc}-{fase}-{nº}-{tipo}[-Rnn]"}</span>. Renomeie, remova o que não
            quiser enviar, ou envie assim (fora do padrão fica com alerta na lista).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {itens?.map((it, i) => (
            <div key={i} className="flex items-start gap-2 rounded-sm border p-2">
              <IconeArquivo nome={it.nome} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={it.file.name}>
                    {it.file.name}
                  </span>
                  {it.fora && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-warning">
                      <AlertTriangle className="size-3" /> fora do padrão
                    </span>
                  )}
                </div>
                {it.fora &&
                  (() => {
                    // Extensão vem do arquivo original (imutável) → base editável, sufixo fixo.
                    const ext = separarExt(it.file.name).ext;
                    const base = it.nome.endsWith(ext) ? it.nome.slice(0, it.nome.length - ext.length) : it.nome;
                    return (
                      <div className="flex items-center gap-1">
                        <Input
                          value={base}
                          className="flex-1 font-mono text-xs"
                          onChange={(e) => renomear(i, e.target.value + ext)}
                        />
                        {ext && (
                          <span className="shrink-0 rounded-sm border bg-muted px-1.5 py-1 font-mono text-xs text-muted-foreground">
                            {ext}
                          </span>
                        )}
                      </div>
                    );
                  })()}
              </div>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remover ${it.file.name} do envio`}
                title="Remover deste envio"
                onClick={() => remover(i)}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={onConfirm} disabled={!itens || itens.length === 0}>
            Enviar {itens?.length ?? 0} arquivo(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
