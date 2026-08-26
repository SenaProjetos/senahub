"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronRight,
  Folder,
  FolderOpen,
  FileArchive,
  Download,
  Eye,
  Upload as UploadIcon,
  Plus,
  Pencil,
  Trash2,
  Share2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  XCircle,
  RotateCcw,
  History,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { foraDoPadrao, parsePranchaFilename } from "@/modules/projetos/pranchas/codigo";
import type {
  ArvoreDisciplina,
  ArvoreArquivoItem,
} from "@/modules/projetos/arquivos/queries";
import { renomearUpload, excluirUpload, excluirUploadsLote, validarArquivosLote, restaurarUpload, excluirUploadDefinitivo, solicitarExclusaoUpload } from "@/modules/uploads/actions";
import type { LixeiraItem } from "@/modules/uploads/queries";
import type { ArtListItem } from "@/modules/projetos/art/queries";
import { LABEL_SITUACAO_ART, rotuloArt } from "@/modules/projetos/art/service";
import { DIAS_LIXEIRA } from "@/modules/uploads/lixeira";
import {
  criarDocumento,
  editarDocumento,
  adicionarVersaoDocumento,
  excluirDocumento,
  excluirVersaoDocumento,
  alternarExibicaoRecebidos,
} from "@/modules/documentos-cliente/actions";
import type { DocumentoItem, DocumentoVersaoItem } from "@/modules/documentos-cliente/queries";
import type { MetaDocumento } from "@/modules/documentos-cliente/schemas";
import { entregaveisAtuais } from "@/modules/uploads/validacao";
import { IconeArquivo } from "@/components/projetos/icone-arquivo";
import { PastaTreeView, SeletorPasta } from "@/components/projetos/pasta-tree-view";
import type { PastaFlat } from "@/modules/projetos/pastas/arvore";
// Estrutura de pastas (subpastas por extensão + rótulos de pacote) — fonte única
// compartilhada com a geração de .zip, para o zip espelhar a árvore desta tela.
import { SUBPASTAS, PACOTES, PACOTE_LABEL, extDe, subpastaDe } from "@/modules/uploads/estrutura";
import { AcoesValidacaoArquivo } from "@/components/projetos/acoes-validacao-arquivo";
import { PreviewPdfButton } from "@/components/pdf/preview-pdf-button";
import { VisualizarDwgButton } from "@/components/dwg/visualizar-dwg-button";
import { refDocumentoDwg } from "@/modules/dwg/desenho-ref";
import { LinkPublicoArquivosButton } from "@/components/projetos/link-publico-arquivos-dialog";
import { formatarCodigo } from "@/modules/projetos/numbering";
import {
  TAMANHO_MAX_LABEL,
  TAMANHO_MAX_BACKUP_LABEL,
  limiteDoPacote,
  limiteLabelDoPacote,
} from "@/modules/uploads/limites";
import { precisaChunk, enviarEmChunks } from "@/lib/upload-grande";
import { useDropzone } from "@/lib/use-dropzone";
import { detectarNovasRevisoes, mensagemNovasRevisoes, type ArquivoExistente } from "@/modules/uploads/revisao-nova";
import { gruposRevisaoAgrupada } from "@/modules/uploads/revisao-agrupada";
import { enviarArquivoComProgresso, ErroEnvio } from "@/components/projetos/upload-progresso";
import { CorrecaoNomeUpload, type DadosCorrecaoNomeUpload } from "@/components/projetos/arquivos/correcao-nome-upload";
import { cn, formatarData, rotuloRevisao } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";

// Subpastas por extensão + pacotes de disciplina vêm de `@/modules/uploads/estrutura`
// (fonte única, também usada pelas rotas de .zip). "Recebidos do cliente" virou
// repositório Documento (ver RecebidosPasta).

const CATEGORIAS_GERAL = ["contrato", "planta", "memorial", "foto", "administrativo", "outro"] as const;

// `extDe` reexportado para compatibilidade com quem importava daqui.
export { extDe };

/** Separa nome em base + extensão (com o ponto, no case original). `.env`/sem ponto → sem extensão. */
function separarExt(nome: string): { base: string; ext: string } {
  const i = nome.lastIndexOf(".");
  return i > 0 ? { base: nome.slice(0, i), ext: nome.slice(i) } : { base: nome, ext: "" };
}
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
export { IconeArquivo };

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

/**
 * Botão que expande/colapsa as versões anteriores de um arquivo (acordeão). Só
 * aparece quando há histórico (>0 versões antigas). Compartilhado por disciplina,
 * Geral e Recebidos.
 */
export function VersaoToggle({
  n,
  aberto,
  onClick,
  nome,
}: {
  n: number;
  aberto: boolean;
  onClick: () => void;
  nome: string;
}) {
  return (
    <button
      type="button"
      className="flex shrink-0 items-center gap-0.5 rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground"
      aria-expanded={aberto}
      aria-label={`${n} versão(ões) anterior(es) de ${nome}`}
      title={aberto ? "Ocultar versões anteriores" : `Ver ${n} versão(ões) anterior(es)`}
      onClick={onClick}
    >
      <History className="size-3.5" />
      <span className="font-mono">{n}</span>
      <ChevronRight className={cn("size-3 transition-transform", aberto && "rotate-90")} />
    </button>
  );
}

function LinhaArquivo({
  a,
  nivel,
  projetoId,
  onRenomear,
  onExcluir,
  onSolicitarExclusao,
  pendentesExclusao,
  podeValidar,
  foraPadrao,
  anteriores,
  historico,
}: {
  a: ArvoreArquivoItem;
  nivel: number;
  projetoId: string;
  onRenomear?: (a: ArvoreArquivoItem) => void;
  onExcluir?: (a: ArvoreArquivoItem) => void;
  /** Só para quem NÃO pode excluir: abre o pedido de exclusão (com justificativa). */
  onSolicitarExclusao?: (a: ArvoreArquivoItem) => void;
  /** Ids (por versão) com pedido de exclusão pendente — desarma o botão de pedir. */
  pendentesExclusao?: Set<string>;
  podeValidar?: boolean;
  foraPadrao?: boolean;
  /** Versões anteriores deste arquivo (só na linha "atual"); expandidas no acordeão. */
  anteriores?: ArvoreArquivoItem[];
  /** Renderiza como uma versão antiga: recuada, sem checkbox/renomear/validar. */
  historico?: boolean;
}) {
  const selecao = useContext(SelecaoCtx);
  const [verVersoes, setVerVersoes] = useState(false);
  const ehPdf = extDe(a.nome) === "pdf";
  const temVersoes = (anteriores?.length ?? 0) > 0;
  const mostrarVersao = a.versao > 1 || historico;
  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 rounded-sm py-1 pr-2 text-sm hover:bg-muted/40",
          historico && "text-muted-foreground",
        )}
        style={{ paddingLeft: `${nivel * 1.25 + 0.75}rem` }}
      >
        {selecao && !historico && (
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
            {mostrarVersao && <span className="ml-1 font-mono text-xs text-muted-foreground">{rotuloRevisao(a.versao)}</span>}
          </a>
        ) : (
          <span className="min-w-0 flex-1 truncate" title={a.nome}>
            {a.nome}
            {mostrarVersao && <span className="ml-1 font-mono text-xs text-muted-foreground">{rotuloRevisao(a.versao)}</span>}
          </span>
        )}
        {foraPadrao && !historico && (
          <span
            className="flex shrink-0 items-center gap-1 text-xs text-warning"
            title="Nome fora do padrão da Lista Mestre — renomeie para o padrão {proj}-{disc}-{fase}-{nº}-{tipo}."
          >
            <AlertTriangle className="size-3.5" /> fora do padrão
          </span>
        )}
        <StatusArquivo aprovado={a.aprovado} ajusteObs={a.ajusteObs} dataAprovacao={a.data} />
        {podeValidar && !historico && (
          <AcoesValidacaoArquivo uploadId={a.id} nomeArquivo={a.nome} validado={a.aprovado} />
        )}
        {temVersoes && (
          <VersaoToggle
            n={anteriores!.length}
            aberto={verVersoes}
            onClick={() => setVerVersoes((v) => !v)}
            nome={a.nome}
          />
        )}
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmtBytes(a.tamanho)}</span>
        {onRenomear && !historico && (
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
        {!historico && <VisualizarDwgButton desenhoId={a.id} nomeArquivo={a.nome} titulo={a.nome} />}
        <a href={a.downloadUrl} className="shrink-0 text-primary hover:text-primary/80" aria-label={`Baixar ${a.nome}`}>
          <Download className="size-3.5" />
        </a>
        {onExcluir && (
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={historico ? `Excluir versão ${a.versao} de ${a.nome}` : `Excluir ${a.nome}`}
            title={historico ? "Excluir esta versão" : "Excluir arquivo"}
            onClick={() => onExcluir(a)}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
        {!onExcluir && onSolicitarExclusao && (
          pendentesExclusao?.has(a.id) ? (
            <span
              className="flex shrink-0 items-center gap-1 text-xs text-warning"
              title="Já existe um pedido de exclusão aguardando decisão de um administrador."
            >
              <Trash2 className="size-3.5" /> exclusão solicitada
            </span>
          ) : (
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={historico ? `Solicitar exclusão da versão ${a.versao} de ${a.nome}` : `Solicitar exclusão de ${a.nome}`}
              title="Solicitar exclusão (um administrador decide)"
              onClick={() => onSolicitarExclusao(a)}
            >
              <Trash2 className="size-3.5" />
            </button>
          )
        )}
      </div>
      {temVersoes &&
        verVersoes &&
        anteriores!.map((v) => (
          <LinhaArquivo
            key={v.id}
            a={v}
            nivel={nivel + 1}
            projetoId={projetoId}
            onExcluir={onExcluir}
            onSolicitarExclusao={onSolicitarExclusao}
            pendentesExclusao={pendentesExclusao}
            historico
          />
        ))}
    </>
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

/**
 * Pedido de exclusão para quem não tem permissão de excluir: o arquivo NÃO sai do lugar,
 * o pedido vai para a fila de Aprovações e notifica os administradores. A justificativa é
 * obrigatória (mínimo 10 caracteres — o mesmo piso validado no schema da action).
 */
function SolicitarExclusaoDialog({ item, onClose }: { item: ArvoreArquivoItem | null; onClose: () => void }) {
  const router = useRouter();
  const [justificativa, setJustificativa] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (item && item.id !== lastId) {
    setLastId(item.id);
    setJustificativa("");
  }

  function enviar() {
    if (!item || justificativa.trim().length < 10) return;
    start(async () => {
      const r = await solicitarExclusaoUpload({ uploadId: item.id, justificativa });
      if (r.ok) {
        toast.success("Pedido enviado — um administrador vai decidir.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar exclusão</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{item?.nome}</span> continua no projeto até que um
            administrador aprove o pedido.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="justificativa-exclusao">Por que este arquivo deve ser excluído?</Label>
            <textarea
              id="justificativa-exclusao"
              rows={3}
              maxLength={1000}
              autoFocus
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              placeholder="Ex.: enviado na disciplina errada; substituído pela revisão R02."
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} disabled={pending || justificativa.trim().length < 10}>
            {pending ? "Enviando…" : "Enviar pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Conta arquivos lógicos (distintos), ignorando versões — mesma `(pacote, nome)` = um arquivo. */
function contarArquivos(arquivos: ArvoreArquivoItem[]): number {
  return new Set(arquivos.map((a) => `${a.pacote}/${a.nome}`)).size;
}

/**
 * Agrupa versões de um mesmo arquivo (dentro de uma subpasta, mesmo pacote+extensão):
 * a versão mais recente vira a linha "atual"; as demais ficam em `anteriores` (desc).
 * O explorer só lista a atual e revela as anteriores no acordeão.
 */
function agruparVersoes(
  arquivos: ArvoreArquivoItem[],
): { atual: ArvoreArquivoItem; anteriores: ArvoreArquivoItem[] }[] {
  const grupos = new Map<string, ArvoreArquivoItem[]>();
  const ordem: string[] = [];
  for (const a of arquivos) {
    if (!grupos.has(a.nome)) {
      grupos.set(a.nome, []);
      ordem.push(a.nome);
    }
    grupos.get(a.nome)!.push(a);
  }
  return ordem.map((nome) => {
    const versoes = grupos.get(nome)!.slice().sort((x, y) => y.versao - x.versao);
    return { atual: versoes[0], anteriores: versoes.slice(1) };
  });
}

/** Agrupa os arquivos de uma disciplina em pacote → subpasta(extensão). */
function agruparPorPacote(arquivos: ArvoreArquivoItem[]) {
  return PACOTES.map((p) => {
    const doPacote = arquivos.filter((a) => a.pacote === p);
    const subpastas = SUBPASTAS.map((s) => ({
      nome: s,
      arquivos: doPacote.filter((a) => subpastaDe(a.nome) === s),
    })).filter((s) => s.arquivos.length > 0);
    // `total` conta arquivos lógicos (sem versões), casando com as linhas visíveis.
    return { pacote: p, total: contarArquivos(doPacote), subpastas };
  }).filter((g) => g.total > 0);
}

export function ArquivosExplorer({
  projeto,
  disciplinas,
  geral,
  podeGerirGeral,
  podeValidar,
  nomenclatura,
  fases,
  tipos,
  recebidos,
  baseArquitetonica,
  podeGerirBaseArquitetonica,
  clienteId,
  podeGerirRecebidos,
  podeExcluirDocumento,
  podeExcluirArquivo,
  podeSolicitarExclusao,
  exclusoesPendentes,
  lixeira,
  podeGerirLink,
  baseUrl,
  clienteEmail,
  linkPublico,
  arts,
}: {
  projeto: { id: string; codigo: string; nome: string };
  disciplinas: ArvoreDisciplina[];
  geral: DocumentoItem[];
  podeGerirGeral: boolean;
  podeValidar: boolean;
  nomenclatura: { exigir: boolean; exigirFase: boolean; padrao: string | null };
  fases: FaseUpload[];
  tipos: FaseUpload[];
  recebidos: DocumentoItem[];
  /** Pasta "Base Arquitetônica" (referência fixa do projeto) — sempre renderizada, mesmo vazia. */
  baseArquitetonica: DocumentoItem[];
  podeGerirBaseArquitetonica: boolean;
  clienteId: string | null;
  podeGerirRecebidos: boolean;
  /** Excluir Documento (Recebidos/Geral) é restrito a admin/supervisor — mais estreito que podeGerir (upload/nova versão). */
  podeExcluirDocumento: boolean;
  /** Excluir arquivo de disciplina (Upload) é override só-admin, com confirmação. */
  podeExcluirArquivo: boolean;
  /** Quem NÃO pode excluir pode PEDIR a exclusão (justificativa → admin decide). */
  podeSolicitarExclusao: boolean;
  /** Uploads com pedido de exclusão pendente visíveis para este usuário. */
  exclusoesPendentes: string[];
  /** Arquivos na lixeira do projeto (só admin recebe; vazio p/ os demais). */
  lixeira: LixeiraItem[];
  /** Pode gerir o link público de arquivos (projetos:gerir). */
  podeGerirLink: boolean;
  /** Base URL (APP_URL) para montar o endereço do link público. */
  baseUrl: string;
  /** E-mail do cliente do projeto — pré-preenche o envio do link (editável). */
  clienteEmail: string | null;
  /** Link público de arquivos já configurado no projeto (ou null). */
  linkPublico: {
    token: string;
    ativo: boolean;
    expiraEm: string | null;
    disciplinaIds: string[];
  } | null;
  /** ARTs do projeto — nó read-only; o cadastro fica na aba ARTs. */
  arts: ArtListItem[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [excluindoPend, excluindo] = useTransition();
  const [validandoPend, validando] = useTransition();
  const [renomeando, setRenomeando] = useState<ArvoreArquivoItem | null>(null);
  const [pedindoExclusao, setPedindoExclusao] = useState<ArvoreArquivoItem | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());

  // Entregáveis validáveis por disciplina (versão atual, pacote A/B, disciplina não finalizada) —
  // hoisted para reusar tanto na linha (podeValidar por arquivo) quanto no lote da seleção.
  const validaveisPorDisciplina = useMemo(() => {
    const mapa = new Map<string, Set<string>>();
    if (!podeValidar) return mapa;
    for (const d of disciplinas) {
      if (d.finalizado) continue;
      const ids = new Set(
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
      mapa.set(d.id, ids);
    }
    return mapa;
  }, [disciplinas, podeValidar]);

  const selValidaveis = useMemo(() => {
    if (validaveisPorDisciplina.size === 0) return [];
    const todos = new Set<string>();
    for (const ids of validaveisPorDisciplina.values()) for (const id of ids) todos.add(id);
    return [...sel].filter((id) => todos.has(id));
  }, [sel, validaveisPorDisciplina]);

  const excluirArquivo = useCallback(
    (a: ArvoreArquivoItem) => {
      void (async () => {
        const ok = await confirm({
          title: "Mover para a lixeira?",
          description: `"${a.nome}" vai para a lixeira do projeto e pode ser restaurado por até ${DIAS_LIXEIRA} dias. Depois disso é excluído em definitivo.`,
          confirmLabel: "Mover para a lixeira",
          variant: "destructive",
        });
        if (!ok) return;
        excluindo(async () => {
          const r = await excluirUpload({ uploadId: a.id });
          if (r.ok) {
            toast.success("Arquivo movido para a lixeira.");
            router.refresh();
          } else toast.error(r.error);
        });
      })();
    },
    [confirm, router],
  );
  // Pedido de exclusão (quem não pode excluir): abre o diálogo da justificativa.
  const pendentesExclusao = useMemo(() => new Set(exclusoesPendentes), [exclusoesPendentes]);
  const solicitarExclusao = useCallback((a: ArvoreArquivoItem) => setPedindoExclusao(a), []);
  // Envio em lote da seleção para a lixeira (só admin — botão gateado por podeExcluirArquivo).
  const excluirSelecionados = useCallback(() => {
    void (async () => {
      const n = sel.size;
      if (n === 0) return;
      const ok = await confirm({
        title: `Mover ${n} arquivo(s) para a lixeira?`,
        description: `Os arquivos selecionados vão para a lixeira do projeto e podem ser restaurados por até ${DIAS_LIXEIRA} dias. Depois disso são excluídos em definitivo.`,
        confirmLabel: "Mover para a lixeira",
        variant: "destructive",
      });
      if (!ok) return;
      excluindo(async () => {
        const r = await excluirUploadsLote({ projetoId: projeto.id, uploadIds: [...sel] });
        if (r.ok) {
          toast.success(`${r.data.total} arquivo(s) movido(s) para a lixeira.`);
          setSel(new Set());
          router.refresh();
        } else toast.error(r.error);
      });
    })();
  }, [confirm, sel, projeto.id, router]);
  // Validação em lote da seleção (só entregáveis validáveis — não-validáveis são ignorados na contagem).
  const validarSelecionados = useCallback(() => {
    const ids = selValidaveis;
    if (ids.length === 0) return;
    validando(async () => {
      const r = await validarArquivosLote({ projetoId: projeto.id, uploadIds: ids });
      if (r.ok) {
        toast.success(`${r.data.total} arquivo(s) validado(s).`);
        setSel(new Set());
        router.refresh();
      } else toast.error(r.error);
    });
  }, [selValidaveis, projeto.id, router]);
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
  // Nomes já enviados por disciplina — o Uploader compara com o que está sendo enviado
  // para avisar que o arquivo vira uma nova versão em vez de substituir em silêncio.
  const existentesPorDisciplina = useMemo(() => {
    const mapa: Record<string, ArquivoExistente[]> = {};
    for (const d of disciplinas) {
      mapa[d.id] = [
        ...d.arquivos.map((a) => ({ nome: a.nome, pacote: a.pacote, pastaId: null, versao: a.versao })),
        ...d.arquivosPasta.map((a) => ({ nome: a.nome, pacote: null, pastaId: a.pastaId, versao: a.versao })),
      ];
    }
    return mapa;
  }, [disciplinas]);
  const temGeral = geral.length > 0 || podeGerirGeral;
  const temRecebidos = recebidos.length > 0 || podeGerirRecebidos;
  // Admin sempre vê a lixeira (mesmo vazia) — é onde os excluídos ficam por 30 dias.
  const mostrarLixeira = podeExcluirArquivo;
  // "Base Arquitetônica" é sempre renderizada (mesmo sem nenhum arquivo) — não conta
  // pra "vazio", que descreve só o RESTO (disciplinas/Recebidos/Geral/lixeira).
  const vazioResto =
    totais.total === 0 && !podeGerirGeral && !temRecebidos && !mostrarLixeira && disciplinas.length === 0;

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
        {podeGerirLink && (
          <LinkPublicoArquivosButton
            projetoId={projeto.id}
            baseUrl={baseUrl}
            disciplinas={disciplinas.map((d) => ({ id: d.id, nome: d.nome }))}
            link={linkPublico}
            clienteEmail={clienteEmail}
          />
        )}
      </div>

      {enviaveis.length > 0 && (
        <Uploader
          disciplinas={enviaveis}
          nomenclatura={nomenclatura}
          existentesPorDisciplina={existentesPorDisciplina}
          fases={fases}
          tipos={tipos}
          codigoProjeto={projeto.codigo}
        />
      )}

      {sel.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-sm border bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
          <span className="text-sm font-medium">{sel.size} arquivo(s) selecionado(s)</span>
          <Button size="sm" onClick={() => baixarZipIds([...sel], `${projeto.codigo}-selecao`)}>
            <Download className="size-3.5" /> Baixar .zip
          </Button>
          {selValidaveis.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="text-status-aprovado"
              disabled={validandoPend}
              onClick={validarSelecionados}
            >
              <ShieldCheck className="size-3.5" />
              {validandoPend ? "Validando…" : `Validar (${selValidaveis.length})`}
            </Button>
          )}
          {podeExcluirArquivo && (
            <Button size="sm" variant="destructive" disabled={excluindoPend} onClick={excluirSelecionados}>
              <Trash2 className="size-3.5" /> {excluindoPend ? "Movendo…" : "Mover para a lixeira"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      <SelecaoCtx.Provider value={ctxSelecao}>
        <Card>
          <CardContent className="p-2">
            <div className="divide-y">
              <PastaBaseArquitetonica
                projetoId={projeto.id}
                clienteId={clienteId}
                arquivos={baseArquitetonica}
                podeGerir={podeGerirBaseArquitetonica}
                podeExcluir={podeExcluirDocumento}
              />
            </div>
            {vazioResto ? (
              <EmptyState
                icon={FolderOpen}
                title="Nenhum outro arquivo"
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
                    podeExcluir={podeExcluirDocumento}
                  />
                )}
                {temGeral && (
                  <PastaGeral
                    projetoId={projeto.id}
                    clienteId={clienteId}
                    geral={geral}
                    podeGerir={podeGerirGeral}
                    podeExcluir={podeExcluirDocumento}
                  />
                )}

                {disciplinas.map((d) => {
                  const grupos = agruparPorPacote(d.arquivos);
                  // Entregáveis na versão atual (pacote A/B, origem manual) → só eles validam.
                  const idsValidaveis = validaveisPorDisciplina.get(d.id) ?? new Set<string>();
                  const podeValidarDisc = podeValidar && !d.finalizado;
                  const totalArquivos = d.usaPastas ? d.arquivosPasta.length : contarArquivos(d.arquivos);
                  return (
                    <Pasta
                      key={d.id}
                      nome={d.nome}
                      contagem={totalArquivos}
                      nivel={0}
                      acao={
                        <div className="flex items-center gap-2">
                          {podeValidar && d.resumo && d.resumo.total > 0 && (
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
                          {totalArquivos > 0 && (
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
                      {d.usaPastas ? (
                        <div className="pl-5">
                          <PastaTreeView
                            disciplinaId={d.id}
                            projetoId={projeto.id}
                            pastas={d.pastas}
                            arquivos={d.arquivosPasta}
                            podeAdmin={podeExcluirArquivo}
                          />
                        </div>
                      ) : grupos.length === 0 ? (
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
                                  contagem={contarArquivos(s.arquivos)}
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
                                  {agruparVersoes(s.arquivos).map(({ atual, anteriores }) => (
                                    <LinhaArquivo
                                      key={atual.id}
                                      a={atual}
                                      anteriores={anteriores}
                                      nivel={3}
                                      projetoId={projeto.id}
                                      onRenomear={d.podeEnviar ? setRenomeando : undefined}
                                      onExcluir={podeExcluirArquivo ? excluirArquivo : undefined}
                                      onSolicitarExclusao={podeSolicitarExclusao ? solicitarExclusao : undefined}
                                      pendentesExclusao={pendentesExclusao}
                                      podeValidar={podeValidarDisc && idsValidaveis.has(atual.id)}
                                      foraPadrao={
                                        nomenclatura.exigir &&
                                        atual.pacote === "A" &&
                                        foraDoPadrao(atual.nome, nomenclatura.padrao)
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

                {arts.length > 0 && <ArtsPasta projetoId={projeto.id} arts={arts} />}

                {mostrarLixeira && <LixeiraPasta itens={lixeira} />}
              </div>
            )}
          </CardContent>
        </Card>
      </SelecaoCtx.Provider>

      <RenomearDialog item={renomeando} onClose={() => setRenomeando(null)} />
      <SolicitarExclusaoDialog item={pedindoExclusao} onClose={() => setPedindoExclusao(null)} />
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
  fd.append("projetoId", projetoId);
  if (clienteId) fd.append("clienteId", clienteId);
  if (origem) fd.append("origem", origem);
  // Arquivos grandes vão em pedaços (Cloudflare corta em ~100 MB); os pequenos, direto.
  if (precisaChunk(file)) {
    const meta = await enviarEmChunks(file);
    fd.append("sessaoId", meta.sessaoId);
    fd.append("nome", file.name);
    fd.append("total", String(meta.total));
    fd.append("tamanho", String(meta.tamanho));
    fd.append("mime", file.type || "");
  } else {
    fd.append("file", file);
  }
  const res = await fetch("/api/documentos", { method: "POST", body: fd });
  const meta = await res.json();
  if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
  return meta as MetaDocumento;
}

/**
 * Linha de uma versão ANTIGA de um Documento (Geral/Recebidos), no acordeão de versões.
 * Recuada e apagada; só baixar/pré-visualizar (+ excluir versão avulsa p/ admin).
 */
function LinhaVersaoDocumento({
  v,
  nome,
  podeExcluir,
  pending,
  onExcluir,
}: {
  v: DocumentoVersaoItem;
  nome: string;
  podeExcluir: boolean;
  pending: boolean;
  onExcluir: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-sm py-1 pr-2 text-sm text-muted-foreground hover:bg-muted/40"
      style={{ paddingLeft: "3rem" }}
    >
      <IconeArquivo nome={v.nomeArquivo} />
      <span className="min-w-0 flex-1 truncate" title={v.nomeArquivo}>
        {nome}
        <span className="ml-1 font-mono text-xs">v{v.numero}</span>
      </span>
      <span className="hidden shrink-0 text-xs md:inline" title={`Enviada em ${formatarData(v.criadoEm)}`}>
        {formatarData(v.criadoEm)}
      </span>
      <span className="shrink-0 font-mono text-xs">{fmtBytes(v.tamanho)}</span>
      <PreviewPdfButton visivel={extDe(v.nomeArquivo) === "pdf"} url={v.downloadUrl} titulo={`${nome} v${v.numero}`} />
      <VisualizarDwgButton desenhoId={refDocumentoDwg(v.id)} nomeArquivo={v.nomeArquivo} titulo={`${nome} v${v.numero}`} />
      <a
        href={v.downloadUrl}
        className="shrink-0 text-primary hover:text-primary/80"
        aria-label={`Baixar ${nome} v${v.numero}`}
      >
        <Download className="size-3.5" />
      </a>
      {podeExcluir && (
        <button
          type="button"
          className="shrink-0 hover:text-destructive disabled:opacity-50"
          aria-label={`Excluir versão ${v.numero} de ${nome}`}
          title="Excluir esta versão"
          disabled={pending}
          onClick={onExcluir}
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function RecebidosPasta({
  projetoId,
  clienteId,
  recebidos,
  podeGerir,
  podeExcluir,
}: {
  projetoId: string;
  clienteId: string | null;
  recebidos: DocumentoItem[];
  podeGerir: boolean;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const fileNovo = useRef<HTMLInputElement>(null);
  const fileVersao = useRef<HTMLInputElement>(null);
  const [alvoVersao, setAlvoVersao] = useState<string | null>(null);
  const [versoesAbertas, setVersoesAbertas] = useState<Set<string>>(new Set());
  const alternarVersoes = (id: string) =>
    setVersoesAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function excluirVersao(versaoId: string) {
    start(async () => {
      const r = await excluirVersaoDocumento({ versaoId });
      if (r.ok) {
        toast.success("Versão excluída.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

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

  // Arrastar-e-soltar aqui também (antes só o Uploader de disciplina tinha).
  const { arrastando, dropProps } = useDropzone(enviarNovos, !podeGerir || busy);

  return (
    <div
      className={cn("rounded-sm transition-colors", arrastando && "bg-primary/5 ring-1 ring-primary")}
      {...(podeGerir ? dropProps : {})}
    >
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
          recebidos.map((d) => {
            const anteriores = d.versoes.slice(1);
            const aberto = versoesAbertas.has(d.id);
            return (
              <Fragment key={d.id}>
                <div
                  className="flex items-center gap-2 rounded-sm py-1 pr-2 text-sm hover:bg-muted/40"
                  style={{ paddingLeft: "1.75rem" }}
                >
                  <IconeArquivo nome={d.atual?.nomeArquivo ?? d.nome} />
                  <span className="min-w-0 flex-1 truncate" title={d.nome}>
                    {d.nome}
                    {d.totalVersoes > 1 && <span className="ml-1 font-mono text-xs text-muted-foreground">v{d.atual?.numero}</span>}
                  </span>
                  {d.origem === "interno" ? (
                    <Badge variant="secondary" className="shrink-0 gap-1" title="Compartilhado da pasta Geral (gerido lá)">
                      <Share2 className="size-3" /> do Geral
                    </Badge>
                  ) : (
                    d.canal !== "interno" && (
                      <Badge variant="outline" className="shrink-0 capitalize">{d.canal}</Badge>
                    )
                  )}
                  {anteriores.length > 0 && (
                    <VersaoToggle
                      n={anteriores.length}
                      aberto={aberto}
                      onClick={() => alternarVersoes(d.id)}
                      nome={d.nome}
                    />
                  )}
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {d.atual ? fmtBytes(d.atual.tamanho) : "—"}
                  </span>
                  {d.atual && (
                    <PreviewPdfButton visivel={extDe(d.atual.nomeArquivo) === "pdf"} url={d.atual.downloadUrl} titulo={d.nome} />
                  )}
                  {d.atual && (
                    <VisualizarDwgButton desenhoId={refDocumentoDwg(d.atual.id)} nomeArquivo={d.atual.nomeArquivo} titulo={d.nome} />
                  )}
                  {d.atual && (
                    <a href={d.atual.downloadUrl} className="shrink-0 text-primary hover:text-primary/80" aria-label={`Baixar ${d.nome}`}>
                      <Download className="size-3.5" />
                    </a>
                  )}
                  {/* Docs compartilhados do Geral (origem=interno) são geridos na pasta Geral, não aqui. */}
                  {podeGerir && d.origem !== "interno" && (
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
                  )}
                  {podeExcluir && d.origem !== "interno" && (
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                      aria-label="Excluir"
                      disabled={pending}
                      onClick={() => excluir(d.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                {aberto &&
                  anteriores.map((v) => (
                    <LinhaVersaoDocumento
                      key={v.id}
                      v={v}
                      nome={d.nome}
                      podeExcluir={podeExcluir && d.origem !== "interno"}
                      pending={pending}
                      onExcluir={() => excluirVersao(v.id)}
                    />
                  ))}
              </Fragment>
            );
          })
        )}
      </Pasta>
    </div>
  );
}

// ── Pasta "Base Arquitetônica": Documento(origem=base_arquitetonica), referência fixa
// do projeto (ex.: base do arquiteto) — visível a todas as disciplinas, sem gate extra
// de capability, mesmo espírito de "Recebidos do cliente" mas em pasta própria. Sempre
// renderizada pelo caller (mesmo sem nenhum arquivo ainda) — não entra na conta de "vazio".

function PastaBaseArquitetonica({
  projetoId,
  clienteId,
  arquivos,
  podeGerir,
  podeExcluir,
}: {
  projetoId: string;
  clienteId: string | null;
  arquivos: DocumentoItem[];
  podeGerir: boolean;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const fileNovo = useRef<HTMLInputElement>(null);
  const fileVersao = useRef<HTMLInputElement>(null);
  const [alvoVersao, setAlvoVersao] = useState<string | null>(null);
  const [versoesAbertas, setVersoesAbertas] = useState<Set<string>>(new Set());
  const alternarVersoes = (id: string) =>
    setVersoesAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function excluirVersao(versaoId: string) {
    start(async () => {
      const r = await excluirVersaoDocumento({ versaoId });
      if (r.ok) {
        toast.success("Versão excluída.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function enviarNovos(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    try {
      let ok = 0;
      for (const file of files) {
        try {
          const meta = await subirDocumento(file, projetoId, clienteId);
          const r = await criarDocumento({ projetoId, nome: file.name, origem: "base_arquitetonica", meta });
          if (r.ok) ok += 1;
          else toast.error(`${file.name}: ${r.error}`);
        } catch (e) {
          toast.error(`${file.name}: ${(e as Error).message}`);
        }
      }
      if (ok > 0) toast.success(`${ok} arquivo(s) enviado(s).`);
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

  // Arrastar-e-soltar aqui também (antes só o Uploader de disciplina tinha).
  const { arrastando, dropProps } = useDropzone(enviarNovos, !podeGerir || busy);

  return (
    <div
      className={cn("rounded-sm transition-colors", arrastando && "bg-primary/5 ring-1 ring-primary")}
      {...(podeGerir ? dropProps : {})}
    >
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
        nome="Base Arquitetônica"
        contagem={arquivos.length}
        nivel={0}
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
        {arquivos.length === 0 ? (
          <p className="py-1.5 pl-10 text-xs text-muted-foreground">
            Referência arquitetônica do projeto (ex.: base do arquiteto), visível a todas as disciplinas. Nada enviado ainda.
          </p>
        ) : (
          arquivos.map((d) => {
            const anteriores = d.versoes.slice(1);
            const aberto = versoesAbertas.has(d.id);
            return (
              <Fragment key={d.id}>
                <div
                  className="flex items-center gap-2 rounded-sm py-1 pr-2 text-sm hover:bg-muted/40"
                  style={{ paddingLeft: "1.75rem" }}
                >
                  <IconeArquivo nome={d.atual?.nomeArquivo ?? d.nome} />
                  <span className="min-w-0 flex-1 truncate" title={d.nome}>
                    {d.nome}
                    {d.totalVersoes > 1 && <span className="ml-1 font-mono text-xs text-muted-foreground">v{d.atual?.numero}</span>}
                  </span>
                  {anteriores.length > 0 && (
                    <VersaoToggle
                      n={anteriores.length}
                      aberto={aberto}
                      onClick={() => alternarVersoes(d.id)}
                      nome={d.nome}
                    />
                  )}
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {d.atual ? fmtBytes(d.atual.tamanho) : "—"}
                  </span>
                  {d.atual && (
                    <PreviewPdfButton visivel={extDe(d.atual.nomeArquivo) === "pdf"} url={d.atual.downloadUrl} titulo={d.nome} />
                  )}
                  {d.atual && (
                    <VisualizarDwgButton desenhoId={refDocumentoDwg(d.atual.id)} nomeArquivo={d.atual.nomeArquivo} titulo={d.nome} />
                  )}
                  {d.atual && (
                    <a href={d.atual.downloadUrl} className="shrink-0 text-primary hover:text-primary/80" aria-label={`Baixar ${d.nome}`}>
                      <Download className="size-3.5" />
                    </a>
                  )}
                  {podeGerir && (
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
                  )}
                  {podeExcluir && (
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                      aria-label="Excluir"
                      disabled={pending}
                      onClick={() => excluir(d.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                {aberto &&
                  anteriores.map((v) => (
                    <LinhaVersaoDocumento
                      key={v.id}
                      v={v}
                      nome={d.nome}
                      podeExcluir={podeExcluir}
                      pending={pending}
                      onExcluir={() => excluirVersao(v.id)}
                    />
                  ))}
              </Fragment>
            );
          })
        )}
      </Pasta>
    </div>
  );
}

// ── Pasta "Geral": Documento(origem=interno), gated por `arquivos_gerais` (Fase 5a) ──

function PastaGeral({
  projetoId,
  clienteId,
  geral,
  podeGerir,
  podeExcluir,
}: {
  projetoId: string;
  clienteId: string | null;
  geral: DocumentoItem[];
  podeGerir: boolean;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<DocumentoItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ nome: "", categoria: "outro", descricao: "" });
  /** Arquivo vindo do arrastar-e-soltar (o input só carrega o que foi escolhido no clique). */
  const [arquivoSolto, setArquivoSolto] = useState<File | null>(null);
  const fileNovo = useRef<HTMLInputElement>(null);
  const fileVersao = useRef<HTMLInputElement>(null);
  const [alvoVersao, setAlvoVersao] = useState<string | null>(null);
  const [versoesAbertas, setVersoesAbertas] = useState<Set<string>>(new Set());
  const alternarVersoes = (id: string) =>
    setVersoesAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function abrirNovo() {
    setArquivoSolto(null);
    setForm({ nome: "", categoria: "outro", descricao: "" });
    setNovo(true);
  }
  function abrirEditar(a: DocumentoItem) {
    setForm({ nome: a.nome, categoria: a.categoria ?? "outro", descricao: a.descricao ?? "" });
    setEditar(a);
  }

  async function salvarNovo() {
    // `arquivoSolto` vem do arrastar-e-soltar; o input segue valendo para quem clica.
    const file = arquivoSolto ?? fileNovo.current?.files?.[0];
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

  function excluirVersao(versaoId: string) {
    start(async () => {
      const r = await excluirVersaoDocumento({ versaoId });
      if (r.ok) {
        toast.success("Versão excluída.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function alternarRecebidos(a: DocumentoItem) {
    start(async () => {
      const r = await alternarExibicaoRecebidos({ id: a.id, exibir: !a.exibirEmRecebidos });
      if (r.ok) {
        toast.success(r.data.exibir ? "Compartilhado em Recebidos do cliente." : "Removido de Recebidos do cliente.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  // Arrastar-e-soltar aqui ABRE o formulário com o arquivo já escolhido — diferente de
  // Recebidos/Base Arquitetônica, que enviam direto: aqui nome/categoria/descrição são
  // obrigatórios, e enviar em silêncio criaria documento sem classificação.
  const { arrastando, dropProps } = useDropzone((files) => {
    const f = files[0];
    if (!f) return;
    setArquivoSolto(f);
    setForm({ nome: f.name, categoria: "outro", descricao: "" });
    setNovo(true);
  }, !podeGerir || busy);

  return (
    <div
      className={cn("rounded-sm transition-colors", arrastando && "bg-primary/5 ring-1 ring-primary")}
      {...(podeGerir ? dropProps : {})}
    >
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
          geral.map((a) => {
            const anteriores = a.versoes.slice(1);
            const aberto = versoesAbertas.has(a.id);
            return (
              <Fragment key={a.id}>
                <div
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
                  {anteriores.length > 0 && (
                    <VersaoToggle
                      n={anteriores.length}
                      aberto={aberto}
                      onClick={() => alternarVersoes(a.id)}
                      nome={a.nome}
                    />
                  )}
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {a.atual ? fmtBytes(a.atual.tamanho) : "—"}
                  </span>
                  {a.atual && (
                    <PreviewPdfButton visivel={extDe(a.atual.nomeArquivo) === "pdf"} url={a.atual.downloadUrl} titulo={a.nome} />
                  )}
                  {a.atual && (
                    <VisualizarDwgButton desenhoId={refDocumentoDwg(a.atual.id)} nomeArquivo={a.atual.nomeArquivo} titulo={a.nome} />
                  )}
                  {a.atual && (
                    <a
                      href={a.atual.downloadUrl}
                      className="shrink-0 text-primary hover:text-primary/80"
                      aria-label={`Baixar ${a.nome}`}
                    >
                      <Download className="size-3.5" />
                    </a>
                  )}
                  {a.exibirEmRecebidos && (
                    <Badge variant="secondary" className="shrink-0 gap-1">
                      <Share2 className="size-3" /> em Recebidos
                    </Badge>
                  )}
                  {podeGerir && (
                    <>
                      <button
                        type="button"
                        className={cn(
                          "shrink-0 disabled:opacity-50",
                          a.exibirEmRecebidos ? "text-primary hover:text-primary/80" : "text-muted-foreground hover:text-foreground",
                        )}
                        aria-label={a.exibirEmRecebidos ? "Parar de exibir em Recebidos do cliente" : "Exibir também em Recebidos do cliente"}
                        title={a.exibirEmRecebidos ? "Parar de exibir em Recebidos do cliente" : "Exibir também em Recebidos do cliente (sem duplicar o arquivo)"}
                        disabled={pending}
                        onClick={() => alternarRecebidos(a)}
                      >
                        <Share2 className="size-3.5" />
                      </button>
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
                    </>
                  )}
                  {podeExcluir && (
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                      aria-label="Excluir"
                      disabled={pending}
                      onClick={() => excluir(a.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                {aberto &&
                  anteriores.map((v) => (
                    <LinhaVersaoDocumento
                      key={v.id}
                      v={v}
                      nome={a.nome}
                      podeExcluir={podeExcluir}
                      pending={pending}
                      onExcluir={() => excluirVersao(v.id)}
                    />
                  ))}
              </Fragment>
            );
          })
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
              {arquivoSolto ? (
                // Arquivo veio arrastado: o input de arquivo não pode ser preenchido por
                // código, então mostramos o nome e deixamos trocar.
                <div className="flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-sm">
                  <IconeArquivo nome={arquivoSolto.name} />
                  <span className="min-w-0 flex-1 truncate" title={arquivoSolto.name}>
                    {arquivoSolto.name}
                  </span>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setArquivoSolto(null)}>
                    Trocar
                  </Button>
                </div>
              ) : (
                <Input ref={fileNovo} type="file" />
              )}
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
    </div>
  );
}

// ── Pasta "ARTs": read-only. O cadastro (criar/versionar/anexar) fica na aba ARTs. ──

function ArtsPasta({ projetoId, arts }: { projetoId: string; arts: ArtListItem[] }) {
  return (
    <Pasta
      nome="ARTs"
      contagem={arts.length}
      nivel={0}
      acao={
        <Button size="xs" variant="ghost" render={<Link href={`/projetos/${projetoId}/arts`} />}>
          Gerir ARTs
        </Button>
      }
    >
      {arts.map((a) => (
        <div key={a.id} className="flex items-center gap-2 py-1.5 pl-8 pr-2 text-sm">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className={cn("min-w-0 truncate", !a.temArquivo && "text-muted-foreground")}>
            {rotuloArt(a)}
            {a.disciplina ? ` · ${a.disciplina.disciplinaTextoLegado}` : ""}
          </span>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {LABEL_SITUACAO_ART[a.situacao] ?? a.situacao}
          </Badge>
          {a.temArquivo ? (
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto shrink-0"
              render={<a href={`/api/projetos/art/${a.id}/download`} />}
            >
              <Download className="size-3" /> PDF
            </Button>
          ) : (
            <span className="ml-auto shrink-0 text-xs italic text-muted-foreground">sem PDF</span>
          )}
        </div>
      ))}
    </Pasta>
  );
}

// ── Pasta "Lixeira": arquivos de disciplina na lixeira (soft delete), só admin ──

function LixeiraPasta({ itens }: { itens: LixeiraItem[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  function restaurar(item: LixeiraItem) {
    start(async () => {
      const r = await restaurarUpload({ uploadId: item.id });
      if (r.ok) {
        toast.success("Arquivo restaurado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function excluirDefinitivo(item: LixeiraItem) {
    void (async () => {
      const ok = await confirm({
        title: "Excluir em definitivo?",
        description: `"${item.nome}" será apagado permanentemente do disco e não poderá ser recuperado.`,
        confirmLabel: "Excluir em definitivo",
        variant: "destructive",
      });
      if (!ok) return;
      start(async () => {
        const r = await excluirUploadDefinitivo({ uploadId: item.id });
        if (r.ok) {
          toast.success("Arquivo excluído em definitivo.");
          router.refresh();
        } else toast.error(r.error);
      });
    })();
  }

  return (
    <Pasta nome="Lixeira" contagem={itens.length} nivel={0}>
      {itens.length === 0 ? (
        <p className="py-1.5 pl-10 text-xs text-muted-foreground">
          Arquivos excluídos ficam aqui por até {DIAS_LIXEIRA} dias antes da remoção definitiva. Lixeira vazia.
        </p>
      ) : (
        itens.map((it) => (
          <div
            key={it.id}
            className="flex items-center gap-2 rounded-sm py-1 pr-2 text-sm hover:bg-muted/40"
            style={{ paddingLeft: "1.75rem" }}
          >
            <IconeArquivo nome={it.nome} />
            <span className="min-w-0 flex-1 truncate" title={it.nome}>
              {it.nome}
            </span>
            <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">{it.disciplina}</Badge>
            <span
              className="hidden shrink-0 text-xs text-muted-foreground md:inline"
              title={`Excluído em ${formatarData(it.excluidoEm)}${it.excluidoPor ? ` por ${it.excluidoPor}` : ""}`}
            >
              {it.excluidoPor ? `por ${it.excluidoPor} · ` : ""}
              {formatarData(it.excluidoEm)}
            </span>
            <span
              className={cn(
                "shrink-0 font-mono text-[10px]",
                it.diasRestantes <= 3 ? "text-destructive" : "text-muted-foreground",
              )}
              title="Dias até a remoção definitiva"
            >
              expira em {it.diasRestantes}d
            </span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmtBytes(it.tamanho)}</span>
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-primary disabled:opacity-50"
              aria-label={`Restaurar ${it.nome}`}
              title="Restaurar"
              disabled={pending}
              onClick={() => restaurar(it)}
            >
              <RotateCcw className="size-3.5" />
            </button>
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
              aria-label={`Excluir ${it.nome} em definitivo`}
              title="Excluir em definitivo"
              disabled={pending}
              onClick={() => excluirDefinitivo(it)}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))
      )}
    </Pasta>
  );
}

// ── Uploader: pasta inteira / múltiplos / arrastar, 1 disciplina por envio ──

type PacoteEnvio = "A" | "B";

/** `pastaId` presente = disciplina usa árvore de pastas (aprovação/laudo) — `alvo` é ignorado nesse caso. */
type FaseUpload = { id: string; sigla: string; nome: string };
type ItemEnvio = { file: File; nome: string; alvo: PacoteEnvio; pastaId?: string; faseId?: string; fora: boolean };

// ── Estado de progresso por arquivo (feedback visual do envio) ──
type StatusEnvio = "pendente" | "enviando" | "ok" | "erro";
type LinhaEnvio = ItemEnvio & {
  status: StatusEnvio;
  progresso: number; // 0–100
  motivo?: string;
  realocado?: boolean;
  retryAfterAt?: number;
  grupoRevisao?: string;
  revisaoAgrupadaId?: string;
};

/**
 * Envia UM arquivo via XHR para expor `upload.onprogress` (fetch não reporta
 * progresso de upload). Resolve com o resultado do servidor; rejeita em falha
 * de rede/HTTP com mensagem amigável. Arquivos grandes (> limite direto) vão em
 * pedaços para contornar o teto de 100 MB do Cloudflare Tunnel.
 */
async function enviarUm(
  item: ItemEnvio,
  disciplinaId: string,
  onProgress: (pct: number) => void,
  opts: { revisaoDeId?: string; novaRevisaoAgrupada?: boolean } = {},
): ReturnType<typeof enviarArquivoComProgresso> {
  return enviarArquivoComProgresso(
    item.file,
    {
      nome: item.nome,
      disciplinaId,
      faseId: item.faseId,
      ...(item.pastaId ? { pastaId: item.pastaId } : { pacote: item.alvo }),
      ...opts,
    },
    onProgress,
  );
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
  existentesPorDisciplina,
  fases,
  tipos,
  codigoProjeto,
}: {
  disciplinas: { id: string; nome: string; sigla: string | null; usaPastas: boolean; pastas: PastaFlat[] }[];
  nomenclatura: { exigir: boolean; exigirFase: boolean; padrao: string | null };
  /** Arquivos já enviados, por disciplina — usado só para avisar que o envio vira nova versão. */
  existentesPorDisciplina: Record<string, ArquivoExistente[]>;
  fases: FaseUpload[];
  tipos: FaseUpload[];
  codigoProjeto: string;
}) {
  const router = useRouter();
  // Sem disciplina pré-selecionada: força a escolha consciente e evita envio no alvo errado.
  const [disciplinaId, setDisciplinaId] = useState("");
  const [pacote, setPacote] = useState<PacoteEnvio>("A");
  const [pastaId, setPastaId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pendentes, setPendentes] = useState<ItemEnvio[] | null>(null);
  const [progresso, setProgresso] = useState<LinhaEnvio[] | null>(null);
  const inputArquivos = useRef<HTMLInputElement>(null);
  const inputPasta = useRef<HTMLInputElement>(null);

  const discSel = disciplinas.find((d) => d.id === disciplinaId);
  const usaPastas = discSel?.usaPastas ?? false;
  const { arrastando, dropProps } = useDropzone((files) => enviar(files), enviando);

  function selecionarDisciplina(id: string) {
    setDisciplinaId(id);
    setPastaId("");
  }

  function enviar(lista: FileList | File[] | null) {
    if (!disciplinaId) {
      toast.error("Selecione a disciplina.");
      return;
    }
    if (usaPastas && !pastaId) {
      toast.error("Selecione a pasta de destino.");
      return;
    }
    const files = lista ? Array.from(lista) : [];
    if (files.length === 0) return;

    // Aprovação/laudo: destino é a pasta escolhida, sem roteamento/limite por pacote.
    if (usaPastas) {
      const limite = limiteDoPacote("");
      const itens: ItemEnvio[] = [];
      for (const f of files) {
        if (f.size > limite) {
          toast.error(`${f.name}: excede o limite de ${limiteLabelDoPacote("")}.`);
          continue;
        }
        itens.push({
          file: f,
          nome: f.name,
          alvo: "A",
          pastaId,
          ...(nomenclatura.exigirFase ? { faseId: faseDoNome(f.name, fases) } : {}),
          fora: false,
        });
      }
      if (itens.length === 0) return;
      if (nomenclatura.exigirFase) {
        setPendentes(itens);
        return;
      }
      void uploadFinal(itens);
      return;
    }

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
      itens.push({
        file: f,
        nome: f.name,
        alvo,
        ...(nomenclatura.exigirFase ? { faseId: faseDoNome(f.name, fases) } : {}),
        fora,
      });
    }
    if (itens.length === 0) return;

    // Nome fora do padrão em Pranchas → revisa antes (renomear no ato ou manter).
    if (itens.some((i) => i.fora) || nomenclatura.exigirFase) {
      setPendentes(itens);
      return;
    }
    void uploadFinal(itens);
  }

  async function uploadFinal(itens: ItemEnvio[]) {
    setPendentes(null);
    // Item 12 da spec: "nunca substituir silenciosamente uma revisão existente". O servidor
    // já versiona (versao+1), mas até aqui nada dizia isso na tela — o aviso sai ANTES do
    // primeiro byte subir, com a versão que será criada.
    const revisoes = detectarNovasRevisoes(
      itens.map((i) => i.nome),
      existentesPorDisciplina[disciplinaId] ?? [],
      usaPastas ? { pastaId } : { pacote: itens[0]?.alvo },
    );
    if (revisoes.length > 0) toast.info(mensagemNovasRevisoes(revisoes), { duration: 6000 });

    const grupos = gruposRevisaoAgrupada(itens.map((item) => ({
      nome: item.nome,
      pacote: usaPastas ? null : item.alvo,
      pastaId: item.pastaId ?? null,
    })));
    const grupoPorIndice = new Map<number, string>(
      grupos.flatMap((grupo) => grupo.indices.map((indice): [number, string] => [indice, grupo.chave])),
    );
    const revisoesPorGrupo = new Map<string, { id: string; numero: number }>();
    const gruposComErro = new Set<string>();
    const enviadosPorGrupo = new Map<string, number>();

    // Envia arquivo a arquivo (XHR) para exibir a lista e o progresso de cada um.
    const linhas: LinhaEnvio[] = itens.map((it, indice) => ({
      ...it,
      status: "pendente",
      progresso: 0,
      grupoRevisao: grupoPorIndice.get(indice),
    }));
    setProgresso(linhas);
    setEnviando(true);
    try {
      let ok = 0;
      let realocados = 0;
      for (let i = 0; i < linhas.length; i++) {
        const grupo = grupoPorIndice.get(i);
        if (grupo && gruposComErro.has(grupo)) {
          setProgresso((prev) => (
            prev ? patchLinha(prev, i, { status: "erro", motivo: "Não foi possível iniciar a revisão conjunta deste documento." }) : prev
          ));
          continue;
        }
        setProgresso((prev) => (prev ? patchLinha(prev, i, { status: "enviando" }) : prev));
        try {
          const revisaoDoGrupo = grupo ? revisoesPorGrupo.get(grupo) : undefined;
          const r = await enviarUm(linhas[i], disciplinaId, (pct) =>
            setProgresso((prev) => (prev ? patchLinha(prev, i, { progresso: pct }) : prev)),
            grupo
              ? revisaoDoGrupo
                ? { revisaoDeId: revisaoDoGrupo.id }
                : { novaRevisaoAgrupada: true }
              : {},
          );
          if (r.ok) {
            ok += 1;
            if (r.realocado) realocados += 1;
            if (grupo && r.revisaoId && r.revisaoNumero !== undefined) {
              revisoesPorGrupo.set(grupo, { id: r.revisaoId, numero: r.revisaoNumero });
              enviadosPorGrupo.set(grupo, (enviadosPorGrupo.get(grupo) ?? 0) + 1);
            }
            setProgresso((prev) =>
              prev
                ? patchLinha(prev, i, {
                    status: "ok",
                    progresso: 100,
                    realocado: r.realocado,
                    revisaoAgrupadaId: grupo ? r.revisaoId : undefined,
                    retryAfterAt: undefined,
                  })
                : prev,
            );
          } else {
            if (grupo) gruposComErro.add(grupo);
            setProgresso((prev) =>
              prev ? patchLinha(prev, i, { status: "erro", motivo: r.motivo ?? "Falha ao salvar." }) : prev,
            );
          }
        } catch (e) {
          if (grupo) gruposComErro.add(grupo);
          setProgresso((prev) =>
            prev
              ? patchLinha(prev, i, {
                  status: "erro",
                  motivo: (e as Error).message,
                  retryAfterAt: e instanceof ErroEnvio && e.retryDepoisSegundos
                    ? Date.now() + e.retryDepoisSegundos * 1_000
                    : undefined,
                })
              : prev,
          );
        }
      }
      if (ok > 0) toast.success(`${ok} arquivo(s) enviado(s).`);
      for (const [grupo, total] of enviadosPorGrupo) {
        const revisao = revisoesPorGrupo.get(grupo);
        if (total > 1 && revisao) toast.success(`${total} arquivos foram enviados juntos na revisão ${rotuloRevisao(revisao.numero)}.`);
      }
      if (realocados > 0) toast.info(`${realocados} arquivo(s) não suportado(s) foram para "Outros".`);
      router.refresh();
    } finally {
      setEnviando(false);
      if (inputArquivos.current) inputArquivos.current.value = "";
      if (inputPasta.current) inputPasta.current.value = "";
    }
  }

  async function reenviar(indices: number[]) {
    const atuais = progresso;
    if (enviando || !atuais || indices.length === 0) return;
    const indicesEfetivos = new Set<number>();
    for (const indice of indices) {
      const linha = atuais[indice];
      if (!linha || linha.status !== "erro") continue;
      const haRevisaoDoGrupo = linha.grupoRevisao && atuais.some(
        (outra) => outra.grupoRevisao === linha.grupoRevisao && !!outra.revisaoAgrupadaId,
      );
      if (linha.grupoRevisao && !haRevisaoDoGrupo) {
        atuais.forEach((outra, outroIndice) => {
          if (outra.grupoRevisao === linha.grupoRevisao && outra.status === "erro") indicesEfetivos.add(outroIndice);
        });
      } else {
        indicesEfetivos.add(indice);
      }
    }
    if (indicesEfetivos.size === 0) return;

    const revisoesPorGrupo = new Map<string, { id: string; numero: number }>();
    atuais.forEach((linha) => {
      if (linha.grupoRevisao && linha.revisaoAgrupadaId) {
        revisoesPorGrupo.set(linha.grupoRevisao, { id: linha.revisaoAgrupadaId, numero: 0 });
      }
    });
    setEnviando(true);
    try {
      for (const indice of [...indicesEfetivos].sort((a, b) => a - b)) {
        const linha = atuais[indice];
        if (!linha) continue;
        setProgresso((prev) => (
          prev ? patchLinha(prev, indice, { status: "enviando", progresso: 0, motivo: undefined, retryAfterAt: undefined }) : prev
        ));
        const revisao = linha.grupoRevisao ? revisoesPorGrupo.get(linha.grupoRevisao) : undefined;
        try {
          const resultado = await enviarUm(
            linha,
            disciplinaId,
            (pct) => setProgresso((prev) => (prev ? patchLinha(prev, indice, { progresso: pct }) : prev)),
            linha.grupoRevisao
              ? revisao
                ? { revisaoDeId: revisao.id }
                : { novaRevisaoAgrupada: true }
              : {},
          );
          if (!resultado.ok) {
            setProgresso((prev) => (
              prev ? patchLinha(prev, indice, { status: "erro", motivo: resultado.motivo ?? "Falha ao salvar." }) : prev
            ));
            continue;
          }
          if (linha.grupoRevisao && resultado.revisaoId) {
            revisoesPorGrupo.set(linha.grupoRevisao, { id: resultado.revisaoId, numero: resultado.revisaoNumero ?? 0 });
          }
          setProgresso((prev) => (
            prev
              ? patchLinha(prev, indice, {
                  status: "ok",
                  progresso: 100,
                  realocado: resultado.realocado,
                  revisaoAgrupadaId: linha.grupoRevisao ? resultado.revisaoId : undefined,
                })
              : prev
          ));
        } catch (error) {
          const espera = error instanceof ErroEnvio ? error.retryDepoisSegundos : undefined;
          setProgresso((prev) => (
            prev
              ? patchLinha(prev, indice, {
                  status: "erro",
                  motivo: (error as Error).message,
                  retryAfterAt: espera ? Date.now() + espera * 1_000 : undefined,
                })
              : prev
          ));
        }
      }
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-sm border border-dashed p-3 transition-colors",
        arrastando && "border-primary bg-primary/5",
      )}
      {...dropProps}
    >
      <RevisarNomesDialog
        itens={pendentes}
        exigirFase={nomenclatura.exigirFase}
        fases={fases}
        dadosCorrecao={discSel ? { codigoProjeto, siglaDisciplina: discSel.sigla, fases, tipos } : null}
        padrao={nomenclatura.padrao}
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
        <Select value={disciplinaId} onValueChange={(v) => v && selecionarDisciplina(v)}>
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

        {!disciplinaId ? (
          <Select<string> disabled>
            <SelectTrigger className="w-44 text-muted-foreground">
              <SelectValue placeholder="Selecione a disciplina…" />
            </SelectTrigger>
            <SelectContent />
          </Select>
        ) : usaPastas ? (
          <SeletorPasta pastas={discSel!.pastas} value={pastaId} onChange={setPastaId} />
        ) : (
          <Select value={pacote} onValueChange={(v) => v && setPacote(v as PacoteEnvio)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A">Pranchas e arquivos</SelectItem>
              <SelectItem value="B">Backup do modelo</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Button
          size="sm"
          variant="outline"
          disabled={enviando || !disciplinaId || (usaPastas && !pastaId)}
          onClick={() => inputArquivos.current?.click()}
        >
          <UploadIcon className="size-3.5" /> Arquivos
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={enviando || !disciplinaId || (usaPastas && !pastaId)}
          onClick={() => inputPasta.current?.click()}
        >
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
          onReenviar={(indices) => void reenviar(indices)}
        />
      )}

      <p className="text-xs text-muted-foreground">
        {usaPastas ? (
          <>Envie arquivos soltos ou uma pasta inteira (ou arraste aqui) para a pasta escolhida. Limite por arquivo: {TAMANHO_MAX_LABEL}.</>
        ) : (
          <>
            Envie arquivos soltos ou uma pasta inteira (ou arraste aqui). Vai para a disciplina escolhida.
            Formatos não suportados em Pranchas vão para &quot;Outros&quot;. Material enviado pelo cliente fica em
            &quot;Recebidos do cliente&quot; (pasta de topo).
            {" "}Limite por arquivo: {TAMANHO_MAX_BACKUP_LABEL} em Backup do modelo, {TAMANHO_MAX_LABEL} nos demais.
            {nomenclatura.exigir && " Nomes fora do padrão em Pranchas pedem revisão antes do envio."}
            {nomenclatura.exigirFase && " A fase de cada documento é obrigatória e pode ser revista antes do envio."}
          </>
        )}
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
  onReenviar,
}: {
  linhas: LinhaEnvio[];
  enviando: boolean;
  onFechar: () => void;
  onReenviar: (indices: number[]) => void;
}) {
  const [agora, setAgora] = useState(Date.now());
  const feitos = linhas.filter((l) => l.status === "ok" || l.status === "erro").length;
  const erros = linhas.filter((l) => l.status === "erro").length;
  const errosProntos = linhas
    .map((linha, indice) => ({ linha, indice }))
    .filter(({ linha }) => linha.status === "erro" && (!linha.retryAfterAt || linha.retryAfterAt <= agora));

  useEffect(() => {
    if (!linhas.some((linha) => linha.status === "erro" && linha.retryAfterAt && linha.retryAfterAt > agora)) return;
    const timer = window.setTimeout(() => setAgora(Date.now()), 1_000);
    return () => window.clearTimeout(timer);
  }, [linhas, agora]);

  function segundosParaReenviar(linha: LinhaEnvio) {
    return linha.retryAfterAt && linha.retryAfterAt > agora
      ? Math.ceil((linha.retryAfterAt - agora) / 1_000)
      : null;
  }

  return (
    <div className="rounded-sm border bg-background/60 p-2">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-xs font-medium">
          {enviando ? "Enviando" : "Envio concluído"} · {feitos}/{linhas.length}
          {erros > 0 && <span className="ml-1 text-destructive">({erros} com erro)</span>}
        </span>
        {!enviando && (
          <div className="flex items-center gap-2">
            {erros > 0 && (
              <button
                type="button"
                onClick={() => onReenviar(errosProntos.map(({ indice }) => indice))}
                disabled={errosProntos.length === 0}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="size-3" /> Reenviar erros
              </button>
            )}
            <button
              type="button"
              onClick={onFechar}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          </div>
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
              {l.status === "erro" && (
                <div className="mt-1">
                  {segundosParaReenviar(l) ? (
                    <span className="text-[11px] text-muted-foreground">
                      Nova tentativa em {segundosParaReenviar(l)} s.
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onReenviar([i])}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      <RotateCcw className="size-3" /> Reenviar
                    </button>
                  )}
                </div>
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
  exigirFase,
  fases,
  dadosCorrecao,
  padrao,
  onCancel,
  onChange,
  onConfirm,
}: {
  itens: ItemEnvio[] | null;
  exigirFase: boolean;
  fases: FaseUpload[];
  dadosCorrecao: DadosCorrecaoNomeUpload | null;
  padrao: string | null;
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
  function atualizarFase(i: number, faseId: string | null) {
    if (!itens) return;
    const copia = itens.slice();
    copia[i] = { ...copia[i], faseId: faseId || undefined };
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
            {exigirFase ? (
              "Confirme a fase de cada documento antes de enviar. A sugestão vem do nome do arquivo e pode ser alterada."
            ) : (
              <>
                {foraCount} arquivo(s) de Pranchas fora do padrão{" "}
                <span className="font-mono">{"{proj}-{disc}-{fase}-{nº}-{tipo}[-Rnn]"}</span>. Renomeie, remova o que não
                quiser enviar, ou envie assim (fora do padrão fica com alerta na lista).
              </>
            )}
            {foraCount > 0 && (
              <span className="mt-1 block font-mono text-[11px]">
                Padrão: {padrao?.trim() || "{proj}-{disc}-{fase}-{nº}-{tipo}[-Rnn]"}
              </span>
            )}
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
                {it.fora && dadosCorrecao && (
                  <CorrecaoNomeUpload
                    nomeOriginal={it.file.name}
                    faseId={it.faseId}
                    dados={dadosCorrecao}
                    onFaseChange={(faseId) => atualizarFase(i, faseId)}
                    onAplicar={(nome) => renomear(i, nome)}
                  />
                )}
                {exigirFase && (
                  <div className="space-y-1">
                    <Label className="text-xs">Fase</Label>
                    <Select value={it.faseId ?? ""} onValueChange={(value) => atualizarFase(i, value)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecione a fase…" />
                      </SelectTrigger>
                      <SelectContent>
                        {fases.map((fase) => (
                          <SelectItem key={fase.id} value={fase.id}>{fase.sigla} · {fase.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fases.length === 0 && <p className="text-xs text-destructive">Cadastre uma fase ativa para este projeto antes de enviar.</p>}
                  </div>
                )}
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
          <Button onClick={onConfirm} disabled={!itens || itens.length === 0 || (exigirFase && itens.some((item) => !item.faseId))}>
            Enviar {itens?.length ?? 0} arquivo(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function faseDoNome(nome: string, fases: FaseUpload[]): string | undefined {
  const sigla = parsePranchaFilename(nome)?.fase;
  return sigla ? fases.find((fase) => fase.sigla.toUpperCase() === sigla)?.id : undefined;
}
