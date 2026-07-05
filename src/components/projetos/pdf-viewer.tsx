"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Maximize2, MapPin, Pencil, RotateCcw, Send, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { PendenciaView } from "@/modules/projetos/pendencias/queries";
import {
  criarPendencia,
  editarPendencia,
  excluirPendencia,
  enviarApontamentos,
  resolverPendencia,
  reabrirPendencia,
  fecharPendencia,
  descartarPendencia,
} from "@/modules/projetos/pendencias/actions";
import { TarefaDialog, type OpcoesUI } from "@/components/tarefas/tarefa-dialog";
import { rotuloItemPendencia } from "@/modules/projetos/pendencias/helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// pdf.js é carregado dinamicamente no cliente (evita SSR e mantém o chunk fora do bundle inicial).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

type Props = {
  uploadId: string;
  projetoId: string;
  disciplinaId: string;
  nomeArquivo: string;
  codigo: string;
  projetoNome: string;
  disciplinaNome: string;
  versao: number;
  versaoAtual: boolean;
  finalizada: boolean;
  podeValidar: boolean;
  ehResponsavel: boolean;
  ehAdmin: boolean;
  currentUserId: string;
  pendenciasIniciais: PendenciaView[];
  colunasTarefa: { id: string; nome: string }[];
  opcoesTarefa: OpcoesUI | null;
  responsaveisPadrao: string[];
  paginaInicial: number | null;
  pinInicial: number | null;
};

const STATUS_META: Record<string, { label: string; cls: string; pin: string }> = {
  aberta: { label: "Aberta", cls: "text-warning border-warning/40", pin: "bg-warning text-warning-foreground" },
  resolvida: { label: "Resolvida", cls: "text-info border-info/40", pin: "bg-info text-info-foreground" },
  fechada: { label: "Fechada", cls: "text-status-aprovado border-status-aprovado/40", pin: "bg-status-aprovado text-white" },
  descartada: { label: "Descartada", cls: "text-muted-foreground border-muted", pin: "bg-muted-foreground text-white" },
};

export function PdfViewer(props: Props) {
  const { uploadId, projetoId, disciplinaId, nomeArquivo, codigo, projetoNome, disciplinaNome, versao, versaoAtual, finalizada, podeValidar, ehResponsavel, ehAdmin, colunasTarefa, opcoesTarefa, responsaveisPadrao, pinInicial, paginaInicial } = props;

  const downloadUrl = `/api/uploads/${uploadId}/download?disposition=inline`;
  // Apontar é permitido mesmo com a entrega já validada — nesse caso o envio abre revisão
  // (mantém a validação financeira). Só a versão vigente recebe pinos novos.
  const podeApontar = podeValidar && versaoAtual;

  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [larguraAlvo, setLarguraAlvo] = useState(900);
  const [zoom, setZoom] = useState(1);
  const [arrastando, setArrastando] = useState(false);
  const panRef = useRef<{ sx: number; sy: number; left: number; top: number } | null>(null);

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 5;
  const ajustarZoom = useCallback((delta: number) => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
  }, []);

  const [pendencias, setPendencias] = useState<PendenciaView[]>(props.pendenciasIniciais);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [modoApontar, setModoApontar] = useState(false);
  const [tarefaDialogAberto, setTarefaDialogAberto] = useState(false);
  const [pending, start] = useTransition();

  // Rascunho de novo apontamento / edição.
  const [draft, setDraft] = useState<{ pagina: number; x: number; y: number } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");

  const colunaRef = useRef<HTMLDivElement | null>(null);
  const paginaRefs = useRef(new Map<number, HTMLDivElement>());

  // ── Carrega o documento ──────────────────────────────────────
  useEffect(() => {
    let cancelado = false;
    let doc: PdfDoc | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        doc = await pdfjs.getDocument({ url: downloadUrl }).promise;
        if (cancelado) {
          doc?.destroy?.();
          return;
        }
        setPdf(doc);
        setNumPages(doc.numPages);
      } catch (e) {
        console.error("[pdf-viewer] falha ao carregar PDF:", e);
        if (!cancelado) setErro("Não foi possível carregar o PDF.");
      }
    })();
    return () => {
      cancelado = true;
      try {
        doc?.destroy?.();
      } catch {
        /* noop */
      }
    };
  }, [downloadUrl]);

  // Largura-alvo de renderização (acompanha a coluna).
  useEffect(() => {
    const el = colunaRef.current;
    if (!el) return;
    const medir = () => setLarguraAlvo(Math.max(320, Math.min(el.clientWidth - 24, 1100)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Zoom com Ctrl + scroll do mouse (scroll normal continua rolando/pan das páginas).
  useEffect(() => {
    const el = colunaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      ajustarZoom(e.deltaY < 0 ? 0.2 : -0.2);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ajustarZoom]);

  const irParaPagina = useCallback((pagina: number) => {
    const alvo = paginaRefs.current.get(pagina);
    alvo?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Deep-link ?pagina=&pin= após o documento carregar.
  useEffect(() => {
    if (!numPages) return;
    if (paginaInicial) irParaPagina(paginaInicial);
    if (pinInicial != null) {
      const alvo = props.pendenciasIniciais.find((p) => p.numero === pinInicial);
      if (alvo) {
        setSelecionadaId(alvo.id);
        if (!paginaInicial) irParaPagina(alvo.pagina);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages]);

  // ── Ações ────────────────────────────────────────────────────
  function abrirNovo(pagina: number, x: number, y: number) {
    setEditId(null);
    setTexto("");
    setDraft({ pagina, x, y });
  }

  function abrirEdicao(p: PendenciaView) {
    setEditId(p.id);
    setTexto(p.texto);
    setDraft(null);
  }

  function salvarDraft() {
    const t = texto.trim();
    if (!t) return;
    if (editId) {
      start(async () => {
        const r = await editarPendencia({ id: editId, texto: t });
        if (r.ok) {
          setPendencias((ps) => ps.map((p) => (p.id === editId ? { ...p, texto: t } : p)));
          setEditId(null);
          setTexto("");
          toast.success("Pendência atualizada.");
        } else toast.error(r.error);
      });
      return;
    }
    if (!draft) return;
    start(async () => {
      const r = await criarPendencia({ uploadId, pagina: draft.pagina, x: draft.x, y: draft.y, texto: t });
      if (r.ok) {
        const nova: PendenciaView = {
          id: r.data.id,
          numero: r.data.numero,
          pagina: draft.pagina,
          x: draft.x,
          y: draft.y,
          texto: t,
          status: "aberta",
          autorId: props.currentUserId,
          autor: "Você",
          tarefaId: null,
          resolvidoEm: null,
          fechadoEm: null,
          createdAt: new Date().toISOString(),
        };
        setPendencias((ps) => [...ps, nova]);
        setSelecionadaId(nova.id);
        setDraft(null);
        setTexto("");
        toast.success(`Apontamento #${nova.numero} criado.`);
      } else toast.error(r.error);
    });
  }

  function excluir(id: string) {
    start(async () => {
      const r = await excluirPendencia({ id });
      if (r.ok) {
        setPendencias((ps) => ps.filter((p) => p.id !== id));
        toast.success("Apontamento excluído.");
      } else toast.error(r.error);
    });
  }

  function mudarStatus(
    id: string,
    fn: (i: { id: string }) => Promise<{ ok: boolean; error?: string }>,
    novo: string,
    msg: string,
  ) {
    start(async () => {
      const r = await fn({ id });
      if (r.ok) {
        setPendencias((ps) => ps.map((p) => (p.id === id ? { ...p, status: novo } : p)));
        toast.success(msg);
      } else toast.error(r.error ?? "Erro.");
    });
  }

  function aplicarEnvio(data: { tarefaId: string; total: number; revisaoAberta: number | null }) {
    setPendencias((ps) => ps.map((p) => (p.status === "aberta" && !p.tarefaId ? { ...p, tarefaId: data.tarefaId } : p)));
    toast.success(
      data.revisaoAberta != null
        ? `Revisão R${data.revisaoAberta} aberta · tarefa com ${data.total} apontamento(s).`
        : `Tarefa criada com ${data.total} apontamento(s).`,
    );
    setModoApontar(false);
  }

  // "Enviar" abre a janela de confirmação da tarefa (prioridade/prazo/etc não são automáticos).
  function enviar() {
    if (abertasSemTarefa === 0) return;
    if (!opcoesTarefa) {
      // Sem dados da janela → cria direto com os defaults do servidor.
      start(async () => {
        const r = await enviarApontamentos({ uploadId });
        if (r.ok) aplicarEnvio(r.data);
        else toast.error(r.error);
      });
      return;
    }
    setTarefaDialogAberto(true);
  }

  // Chamado pela janela de confirmação: cria a tarefa com os campos revisados.
  async function submeterTarefa(payload: {
    titulo: string;
    descricao: string;
    statusId: string;
    prazo: string;
    prioridade: string;
    responsaveisIds: string[];
    dependeDeIds: string[];
  }): Promise<boolean> {
    const r = await enviarApontamentos({
      uploadId,
      titulo: payload.titulo,
      descricao: payload.descricao,
      statusId: payload.statusId,
      prazo: payload.prazo,
      prioridade: payload.prioridade,
      responsaveisIds: payload.responsaveisIds,
      dependeDeIds: payload.dependeDeIds,
    });
    if (r.ok) {
      aplicarEnvio(r.data);
      return true;
    }
    toast.error(r.error);
    return false;
  }

  // ── Pan por arraste (quando não está apontando) ──────────────
  function panDown(e: React.PointerEvent<HTMLDivElement>) {
    if (modoApontar || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a")) return; // não sequestra pinos/links
    const el = colunaRef.current;
    if (!el) return;
    panRef.current = { sx: e.clientX, sy: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    setArrastando(true);
    el.setPointerCapture?.(e.pointerId);
  }
  function panMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = panRef.current;
    const el = colunaRef.current;
    if (!p || !el) return;
    el.scrollLeft = p.left - (e.clientX - p.sx);
    el.scrollTop = p.top - (e.clientY - p.sy);
  }
  function panUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!panRef.current) return;
    panRef.current = null;
    setArrastando(false);
    colunaRef.current?.releasePointerCapture?.(e.pointerId);
  }

  const enviaveis = pendencias
    .filter((p) => p.status === "aberta" && !p.tarefaId)
    .slice()
    .sort((a, b) => a.numero - b.numero);
  const abertasSemTarefa = enviaveis.length;

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3 border-b pb-3">
        <Link
          href={`/projetos/${projetoId}/arquivos`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Arquivos
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight">{nomeArquivo}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {codigo} · {projetoNome} · {disciplinaNome} · v{versao}
            {!versaoAtual && " (versão anterior)"}
          </p>
        </div>
        {/* Zoom / ajuste à largura */}
        {pdf && (
          <div className="flex items-center gap-0.5 rounded-sm border px-1">
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => ajustarZoom(-0.25)}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Diminuir zoom"
              title="Diminuir zoom"
            >
              <ZoomOut className="size-4" />
            </Button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="min-w-[4.5ch] text-center text-xs tabular-nums text-muted-foreground hover:text-foreground"
              title="Ajustar à largura (100%)"
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => ajustarZoom(0.25)}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Aumentar zoom"
              title="Aumentar zoom"
            >
              <ZoomIn className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => setZoom(1)}
              aria-label="Ajustar à largura"
              title="Ajustar à largura"
            >
              <Maximize2 className="size-4" />
            </Button>
          </div>
        )}
        {podeApontar ? (
          <>
            <Button
              size="sm"
              variant={modoApontar ? "default" : "outline"}
              onClick={() => setModoApontar((v) => !v)}
              className="gap-1"
              title="Ative e clique na prancha para criar um apontamento"
            >
              <MapPin className="size-4" /> {modoApontar ? "Apontando…" : "Apontar"}
            </Button>
            <Button
              size="sm"
              onClick={enviar}
              disabled={pending || abertasSemTarefa === 0}
              className="gap-1"
              title={finalizada ? "Abrirá revisão (mantém a validação financeira)" : undefined}
            >
              <Send className="size-4" /> Enviar {abertasSemTarefa > 0 && `(${abertasSemTarefa})`}
            </Button>
          </>
        ) : podeValidar ? (
          <span className="text-xs text-muted-foreground">Versão anterior — aponte na versão atual.</span>
        ) : null}
      </div>

      {/* Aviso: apontar numa entrega já validada abre revisão */}
      {podeApontar && finalizada && (
        <div className="flex items-center gap-2 border-b bg-warning/10 px-3 py-1.5 text-xs text-warning">
          <MapPin className="size-3.5 shrink-0" /> Entrega já validada — enviar apontamentos abre revisão.
        </div>
      )}

      {/* Dica do modo-apontar */}
      {modoApontar && (
        <div className="flex items-center gap-2 border-b bg-primary/5 px-3 py-1.5 text-xs text-primary">
          <MapPin className="size-3.5 shrink-0" /> Clique no ponto da prancha onde está a pendência.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Coluna de páginas */}
        <div
          ref={colunaRef}
          className={cn(
            "min-w-0 flex-1 overflow-auto bg-muted/30 p-3",
            !modoApontar && (arrastando ? "cursor-grabbing select-none" : "cursor-grab"),
          )}
          onPointerDown={panDown}
          onPointerMove={panMove}
          onPointerUp={panUp}
          onPointerLeave={panUp}
        >
          {erro ? (
            <div className="mx-auto mt-16 max-w-sm text-center text-sm text-destructive">{erro}</div>
          ) : !pdf ? (
            <div className="mt-16 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando prancha…
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                <Pagina
                  key={n}
                  registrar={(el) => {
                    if (el) paginaRefs.current.set(n, el);
                    else paginaRefs.current.delete(n);
                  }}
                  pdf={pdf}
                  pagina={n}
                  largura={Math.round(larguraAlvo * zoom)}
                  pins={pendencias.filter((p) => p.pagina === n)}
                  selecionadaId={selecionadaId}
                  modoApontar={modoApontar}
                  onSelecionar={setSelecionadaId}
                  onApontar={(x, y) => abrirNovo(n, x, y)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Painel lateral */}
        <aside className="flex w-80 shrink-0 flex-col border-l">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Apontamentos</span>
            <Badge variant="outline" className="text-xs">
              {pendencias.length}
            </Badge>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {pendencias.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {podeApontar
                  ? "Clique em “Apontar” e toque na prancha para criar uma pendência."
                  : "Nenhum apontamento nesta prancha."}
              </p>
            ) : (
              <ul className="divide-y">
                {pendencias
                  .slice()
                  .sort((a, b) => a.numero - b.numero)
                  .map((p) => {
                    const meta = STATUS_META[p.status] ?? STATUS_META.aberta;
                    const sel = selecionadaId === p.id;
                    // Editar/excluir: só quem criou o apontamento (ou admin), enquanto aberto e sem tarefa.
                    const editavel =
                      (p.autorId === props.currentUserId || ehAdmin) && p.status === "aberta" && !p.tarefaId;
                    return (
                      <li
                        key={p.id}
                        className={cn("cursor-pointer px-3 py-2 text-sm hover:bg-muted/50", sel && "bg-muted")}
                        onClick={() => {
                          setSelecionadaId(p.id);
                          irParaPagina(p.pagina);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px] font-bold", meta.pin)}>
                            {p.numero}
                          </span>
                          <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", meta.cls)}>
                            {meta.label}
                          </Badge>
                          <span className="ml-auto text-[10px] text-muted-foreground">pág. {p.pagina}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs">{p.texto}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {editavel && (
                            <>
                              <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs" onClick={() => abrirEdicao(p)} disabled={pending}>
                                <Pencil className="size-3" /> editar
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs text-destructive" onClick={() => excluir(p.id)} disabled={pending}>
                                <Trash2 className="size-3" /> excluir
                              </Button>
                            </>
                          )}
                          {ehResponsavel && p.status === "aberta" && (
                            <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs text-info" onClick={() => mudarStatus(p.id, resolverPendencia, "resolvida", "Marcada como resolvida.")} disabled={pending}>
                              <Check className="size-3" /> resolver
                            </Button>
                          )}
                          {ehResponsavel && p.status === "resolvida" && (
                            <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs" onClick={() => mudarStatus(p.id, reabrirPendencia, "aberta", "Reaberta.")} disabled={pending}>
                              <Undo2 className="size-3" /> reabrir
                            </Button>
                          )}
                          {podeValidar && p.status !== "fechada" && p.status !== "descartada" && (
                            <>
                              <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs text-status-aprovado" onClick={() => mudarStatus(p.id, fecharPendencia, "fechada", "Pendência fechada.")} disabled={pending}>
                                <Check className="size-3" /> fechar
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs text-muted-foreground" onClick={() => mudarStatus(p.id, descartarPendencia, "descartada", "Pendência descartada.")} disabled={pending}>
                                <RotateCcw className="size-3" /> descartar
                              </Button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* Dialog de texto (novo / editar) */}
      <Dialog
        open={draft != null || editId != null}
        onOpenChange={(o) => {
          if (!o) {
            setDraft(null);
            setEditId(null);
            setTexto("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar apontamento" : "Novo apontamento"}</DialogTitle>
            <DialogDescription className="truncate">
              {nomeArquivo}
              {draft && ` · pág. ${draft.pagina}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pendencia-texto">Descrição da pendência</Label>
            <textarea
              id="pendencia-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: cota ausente na planta baixa; revisar espessura da parede."
              maxLength={1000}
              rows={4}
              autoFocus
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDraft(null);
                setEditId(null);
                setTexto("");
              }}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button onClick={salvarDraft} disabled={pending || !texto.trim()}>
              {editId ? "Salvar" : "Criar apontamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Janela de confirmação da tarefa (prioridade/prazo/responsáveis antes de salvar) */}
      {opcoesTarefa && tarefaDialogAberto && (
        <TarefaDialog
          open={tarefaDialogAberto}
          onOpenChange={setTarefaDialogAberto}
          tarefa={null}
          opcoes={opcoesTarefa}
          colunas={colunasTarefa}
          meId={props.currentUserId}
          meRole={ehAdmin ? "admin" : "supervisor"}
          tituloDialog="Confirmar tarefa de ajustes"
          itensReadonly
          valoresIniciais={{
            titulo: `Ajustes · ${nomeArquivo} (${disciplinaNome} — ${codigo})`,
            descricao: `${enviaveis.length} apontamento(s) na prancha ${nomeArquivo}.`,
            statusId: colunasTarefa[0]?.id ?? "",
            projetoId,
            disciplinaId,
            responsaveisIds: responsaveisPadrao,
            itens: enviaveis.map((p) => ({ descricao: rotuloItemPendencia(p), concluido: false })),
          }}
          onSubmit={submeterTarefa}
        />
      )}
    </div>
  );
}

// ── Página individual (canvas + overlay de pinos) ──────────────
function Pagina({
  pdf,
  pagina,
  largura,
  pins,
  selecionadaId,
  modoApontar,
  onSelecionar,
  onApontar,
  registrar,
}: {
  pdf: PdfDoc;
  pagina: number;
  largura: number;
  pins: PendenciaView[];
  selecionadaId: string | null;
  modoApontar: boolean;
  onSelecionar: (id: string) => void;
  onApontar: (x: number, y: number) => void;
  registrar: (el: HTMLDivElement | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let cancelado = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let task: any;
    (async () => {
      try {
        const page = await pdf.getPage(pagina);
        const base = page.getViewport({ scale: 1 });
        const scale = largura / base.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelado) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        task = page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
        await task.promise;
        if (!cancelado) setDim({ w: Math.floor(viewport.width), h: Math.floor(viewport.height) });
      } catch (e) {
        // Cancelamento de render dispara exceção esperada ao trocar largura.
        if (!cancelado) console.debug("[pdf-viewer] render pág.", pagina, e);
      }
    })();
    return () => {
      cancelado = true;
      try {
        task?.cancel?.();
      } catch {
        /* noop */
      }
    };
  }, [pdf, pagina, largura]);

  function clique(e: React.MouseEvent<HTMLDivElement>) {
    if (!modoApontar) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onApontar(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)));
  }

  return (
    <div ref={registrar} className="relative mx-auto shadow-sm" style={{ width: dim?.w }}>
      <canvas ref={canvasRef} className="block bg-white" />
      <div
        className={cn("absolute inset-0", modoApontar && "cursor-crosshair")}
        onClick={clique}
        style={{ width: dim?.w, height: dim?.h }}
      >
        {pins.map((p) => {
          const meta = STATUS_META[p.status] ?? STATUS_META.aberta;
          const sel = selecionadaId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelecionar(p.id);
              }}
              className={cn(
                "absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold shadow ring-2 ring-white transition",
                meta.pin,
                sel && "ring-4 ring-ring",
              )}
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              title={`#${p.numero}: ${p.texto}`}
            >
              {p.numero}
            </button>
          );
        })}
      </div>
    </div>
  );
}
