"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecks, Loader2, MessageSquarePlus, ZoomIn, ZoomOut } from "lucide-react";
import { PdfPagina } from "@/components/pdf/pdf-pagina";
import { MarcacaoSvg } from "@/components/pdf/marcacao-svg";
import { usePinchZoom } from "@/components/pdf/use-pinch-zoom";
import { useZoomAncorado } from "@/components/pdf/use-zoom-ancorado";
import { SeletorZoom } from "@/components/pdf/seletor-zoom";
import { passoZoom, ZOOM_PDF_MAX, ZOOM_PDF_MIN, zoomPelaRodaPdf } from "@/lib/pdf-zoom";
import { useAlturaRestante } from "@/lib/use-altura-restante";
import { cn } from "@/lib/utils";
import {
  ESTILO_TRACO_PADRAO,
  construirMarcacao,
  construirRabisco,
  type Marcacao,
  type TipoMarcacao,
} from "@/modules/projetos/pendencias/marcacao";
import { medirMm, type ModoCalibracao } from "@/modules/projetos/pendencias/medicao";
import { MOTIVO_SEM_ESCALA } from "@/modules/portal/pedido-revisao/conversao";
import { LIMITE_TEXTO_MARCACAO, MAX_MARCACOES } from "@/modules/portal/pedido-revisao/regras";
import { criarPedidoRevisao } from "@/modules/portal/pedido-revisao/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { enviarAnexosDoPedido } from "@/components/portal/pedir-revisao-dialog";
import { BarraFerramentas } from "./barra-ferramentas";
import { ListaMarcacoes } from "./lista-marcacoes";
import { gravarRascunho, lerRascunho, limparRascunho, type MarcacaoRascunho, type RascunhoPedido } from "./rascunho-local";

// pdf.js é carregado dinamicamente no cliente (evita SSR e mantém o chunk fora do bundle inicial).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

export type CalibracaoDaPrancha = { pagina: number; mmPorPonto: number; modo: ModoCalibracao };

/** Marcação já enviada (de um pedido), desenhada só para leitura. */
export type MarcaDeLeitura = {
  id: string;
  numero: number;
  pagina: number;
  x: number;
  y: number;
  texto: string;
  marcacao: Marcacao | null;
  medidaMm: number | null;
};

type Ponto = { x: number; y: number };
type Dim = { w: number; h: number; wPt: number; hPt: number };
/** Marcação recém-desenhada, esperando o texto. */
type Nova = Omit<MarcacaoRascunho, "id" | "texto">;

function limitar(v: number) {
  return Math.min(1, Math.max(0, v));
}

function pontoDoEvento(e: React.PointerEvent<HTMLDivElement>): Ponto {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: limitar((e.clientX - r.left) / r.width), y: limitar((e.clientY - r.top) / r.height) };
}

/**
 * Camada de UMA página: as marcações (leitura e rascunho) e, no modo de pedido, a captura do desenho. Coordenadas
 * normalizadas na caixa da página como ela aparece (com o `/Rotate` do PDF, sem giro de leitura) — o MESMO espaço da
 * `Pendencia`, então o rascunho de apontamento cai no mesmo ponto. Componente de topo (nunca definido dentro do pai).
 */
function CamadaPagina({
  pagina,
  dim,
  desenhando,
  ferramenta,
  calibracao,
  leitura,
  rascunho,
  onNova,
}: {
  pagina: number;
  dim: Dim;
  desenhando: boolean;
  ferramenta: TipoMarcacao;
  calibracao: CalibracaoDaPrancha | null;
  leitura: MarcaDeLeitura[];
  rascunho: { m: MarcacaoRascunho; numero: number }[];
  onNova: (n: Nova) => void;
}) {
  const [inicio, setInicio] = useState<Ponto | null>(null);
  const [atual, setAtual] = useState<Ponto | null>(null);
  const [traco, setTraco] = useState<Ponto[]>([]);
  const paginaPt = { w: dim.wPt, h: dim.hPt };

  function aoPressionar(e: React.PointerEvent<HTMLDivElement>) {
    if (!desenhando || e.button !== 0) return;
    if (ferramenta === "medida" && !calibracao) {
      toast.error(MOTIVO_SEM_ESCALA);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pontoDoEvento(e);
    setInicio(p);
    setAtual(p);
    setTraco([p]);
  }
  function aoMover(e: React.PointerEvent<HTMLDivElement>) {
    if (!inicio) return;
    const p = pontoDoEvento(e);
    setAtual(p);
    if (ferramenta === "livre") setTraco((t) => [...t, p]);
  }
  function aoSoltar(e: React.PointerEvent<HTMLDivElement>) {
    if (!inicio) return;
    const fim = pontoDoEvento(e);
    const ini = inicio;
    setInicio(null);
    setAtual(null);
    const pontos = [...traco, fim];
    setTraco([]);
    if (ferramenta === "livre") {
      const r = construirRabisco([pontos], [ESTILO_TRACO_PADRAO]);
      if (r) onNova({ pagina, x: r.x, y: r.y, marcacao: r.marcacao, paginaPt });
      return;
    }
    const r = construirMarcacao(ferramenta, ini, ferramenta === "ponto" ? ini : fim);
    if (!r) {
      toast.info("Arraste para desenhar a forma.");
      return;
    }
    const medidaMm = ferramenta === "medida" && calibracao ? medirMm(ini, fim, dim.wPt, dim.hPt, calibracao.mmPorPonto) : null;
    onNova({
      pagina,
      x: r.x,
      y: r.y,
      marcacao: r.marcacao.tipo === "ponto" ? null : r.marcacao,
      paginaPt,
      medidaMm,
    });
  }

  const previa: Marcacao | null =
    inicio && atual && ferramenta !== "ponto" && ferramenta !== "livre"
      ? { tipo: ferramenta, pontos: [{ dx: atual.x - inicio.x, dy: atual.y - inicio.y }] }
      : null;

  return (
    <div
      className={cn("absolute inset-0", desenhando && "cursor-crosshair")}
      // Alfinete é um toque: a rolagem por toque continua (um arrasto vira "cancel"). As outras formas são arrasto.
      style={desenhando && ferramenta !== "ponto" ? { touchAction: "none" } : undefined}
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={() => {
        setInicio(null);
        setAtual(null);
        setTraco([]);
      }}
    >
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${dim.w} ${dim.h}`} preserveAspectRatio="none" aria-hidden>
        {leitura.map((m) =>
          m.marcacao ? (
            <g key={m.id} className="text-muted-foreground">
              <MarcacaoSvg dim={dim} x={m.x} y={m.y} marcacao={m.marcacao} medidaMm={m.medidaMm} />
            </g>
          ) : null,
        )}
        {rascunho.map(({ m }) =>
          m.marcacao ? (
            <g key={m.id} className="text-primary">
              <MarcacaoSvg dim={dim} x={m.x} y={m.y} marcacao={m.marcacao} medidaMm={m.medidaMm ?? null} />
            </g>
          ) : null,
        )}
        {previa && inicio && (
          <g className="text-primary">
            <MarcacaoSvg dim={dim} x={inicio.x} y={inicio.y} marcacao={previa} />
          </g>
        )}
        {ferramenta === "livre" && traco.length > 1 && (
          <polyline
            className="text-primary"
            points={traco.map((p) => `${p.x * dim.w},${p.y * dim.h}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {leitura.map((m) => (
        <span
          key={m.id}
          title={m.texto}
          className="pointer-events-none absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-muted-foreground text-[10px] font-bold text-background shadow ring-2 ring-background"
          style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
          aria-hidden
        >
          {m.numero}
        </span>
      ))}
      {rascunho.map(({ m, numero }) => (
        <span
          key={m.id}
          className="pointer-events-none absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow ring-2 ring-background"
          style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
          aria-hidden
        >
          {numero}
        </span>
      ))}
    </div>
  );
}

/**
 * Visualizador da prancha no portal do cliente (e, em leitura, no detalhe da coordenação): páginas, zoom e as
 * marcações. Com `pedir`, o botão "Pedir revisão" liga as 6 ferramentas da equipe; o rascunho fica no navegador até
 * "Enviar pedido". NÃO usa o visualizador interno — nada de tarefas, validação ou apontamentos da equipe aqui.
 */
export function VisualizadorPrancha({
  pdfUrl,
  uploadId,
  calibracoes,
  leitura,
  rotuloLeitura,
  pedir,
}: {
  pdfUrl: string;
  uploadId: string;
  calibracoes: CalibracaoDaPrancha[];
  leitura: MarcaDeLeitura[];
  /** Legenda das marcações de leitura (ex.: "Marcações de pedidos aguardando a equipe"). */
  rotuloLeitura?: string;
  pedir?: { projetoId: string; voltarPara: string } | null;
}) {
  const router = useRouter();
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [larguraAlvo, setLarguraAlvo] = useState(800);
  const colunaRef = useRef<HTMLDivElement | null>(null);
  const { ref: quadroRef, style: estiloQuadro } = useAlturaRestante<HTMLDivElement>({ folga: 16 });

  const [desenhando, setDesenhando] = useState(false);
  const [ferramenta, setFerramenta] = useState<TipoMarcacao>("ponto");
  const [rascunho, setRascunho] = useState<RascunhoPedido>({ comentario: "", marcacoes: [] });
  const [nova, setNova] = useState<Nova | null>(null);
  const [textoNova, setTextoNova] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [folhaAberta, setFolhaAberta] = useState(false);
  const [enviando, startTransition] = useTransition();
  const idTextoNova = useId();
  const idLegenda = useId();

  const { zoom, setZoom } = useZoomAncorado(colunaRef);
  const ajustarZoom = useCallback((direcao: 1 | -1) => setZoom((z) => passoZoom(z, direcao)), [setZoom]);
  usePinchZoom(colunaRef, { zoom, setZoom, min: ZOOM_PDF_MIN, max: ZOOM_PDF_MAX });

  // Rascunho guardado neste navegador: volta direto ao modo de pedido.
  useEffect(() => {
    if (!pedir) return;
    const r = lerRascunho(uploadId);
    if (r) {
      setRascunho(r);
      setDesenhando(true);
      toast.info("Seu rascunho de pedido desta prancha foi recuperado.");
    }
  }, [pedir, uploadId]);

  function mudarRascunho(fn: (r: RascunhoPedido) => RascunhoPedido) {
    setRascunho((r) => {
      const novo = fn(r);
      gravarRascunho(uploadId, novo);
      return novo;
    });
  }

  useEffect(() => {
    let cancelado = false;
    let doc: PdfDoc | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        doc = await pdfjs.getDocument({ url: pdfUrl }).promise;
        if (cancelado) {
          doc?.destroy?.();
          return;
        }
        setPdf(doc);
        setNumPages(doc.numPages);
      } catch (e) {
        console.error("[visualizador-prancha] falha ao carregar PDF:", e);
        if (!cancelado) setErro("Não foi possível abrir a prancha. Tente de novo mais tarde.");
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
  }, [pdfUrl]);

  useEffect(() => {
    const el = colunaRef.current;
    if (!el) return;
    const medir = () => setLarguraAlvo(Math.max(280, Math.min(el.clientWidth - 24, 1400)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = colunaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => zoomPelaRodaPdf(z, e.deltaY), { clientX: e.clientX, clientY: e.clientY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  const calibracaoDa = (pagina: number) => calibracoes.find((c) => c.pagina === pagina) ?? null;
  const motivoSemCota = calibracoes.length === 0 ? MOTIVO_SEM_ESCALA : null;

  function confirmarNova() {
    if (!nova || !textoNova.trim()) return;
    const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    mudarRascunho((r) => ({ ...r, marcacoes: [...r.marcacoes, { ...nova, id, texto: textoNova.trim() }] }));
    setNova(null);
    setTextoNova("");
  }

  function descartar() {
    limparRascunho(uploadId);
    setRascunho({ comentario: "", marcacoes: [] });
    setArquivos([]);
    setDesenhando(false);
    setFolhaAberta(false);
  }

  function enviar() {
    if (!pedir) return;
    startTransition(async () => {
      const r = await criarPedidoRevisao({
        projetoId: pedir.projetoId,
        uploadId,
        comentario: rascunho.comentario,
        marcacoes: rascunho.marcacoes.map((m) => ({
          pagina: m.pagina,
          x: m.x,
          y: m.y,
          texto: m.texto,
          marcacao: m.marcacao,
          paginaPt: m.paginaPt,
        })),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const falhas = await enviarAnexosDoPedido(r.data.id, arquivos);
      limparRascunho(uploadId);
      toast.success("Pedido enviado à equipe. A resposta aparece aqui no portal.");
      for (const f of falhas) toast.error(`${f} O pedido foi enviado sem este anexo.`);
      router.push(pedir.voltarPara);
      router.refresh();
    });
  }

  const painel = (
    <ListaMarcacoes
      marcacoes={rascunho.marcacoes}
      onTexto={(id, texto) => mudarRascunho((r) => ({ ...r, marcacoes: r.marcacoes.map((m) => (m.id === id ? { ...m, texto } : m)) }))}
      onRemover={(id) => mudarRascunho((r) => ({ ...r, marcacoes: r.marcacoes.filter((m) => m.id !== id) }))}
      comentario={rascunho.comentario}
      onComentario={(comentario) => mudarRascunho((r) => ({ ...r, comentario }))}
      arquivos={arquivos}
      onArquivos={setArquivos}
      onEnviar={enviar}
      onDescartar={descartar}
      enviando={enviando}
    />
  );

  return (
    <div
      ref={quadroRef}
      style={estiloQuadro}
      className={cn("grid h-[75svh] min-h-0 grid-cols-1 gap-3 md:h-auto", desenhando && "lg:grid-cols-[minmax(0,1fr)_320px]")}
    >
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5">
          {pedir && !desenhando && (
            <Button size="sm" onClick={() => setDesenhando(true)}>
              <MessageSquarePlus className="size-4" /> Pedir revisão
            </Button>
          )}
          {desenhando && (
            <BarraFerramentas ferramenta={ferramenta} onEscolher={setFerramenta} motivoSemCota={motivoSemCota} idMotivo={idLegenda} />
          )}
          {desenhando && (
            <Button size="sm" variant="outline" className="lg:hidden" onClick={() => setFolhaAberta(true)}>
              <ListChecks className="size-4" /> Pedido ({rascunho.marcacoes.length})
            </Button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-7" onClick={() => ajustarZoom(-1)} disabled={zoom <= ZOOM_PDF_MIN} aria-label="Diminuir zoom">
              <ZoomOut className="size-3.5" />
            </Button>
            <SeletorZoom zoom={zoom} onEscolher={(z) => setZoom(z)} />
            <Button variant="outline" size="icon" className="size-7" onClick={() => ajustarZoom(1)} disabled={zoom >= ZOOM_PDF_MAX} aria-label="Aumentar zoom">
              <ZoomIn className="size-3.5" />
            </Button>
          </div>
        </div>
        {(rotuloLeitura && leitura.length > 0) || desenhando ? (
          <p id={idLegenda} role="status" className="border-b px-3 py-1 text-xs text-muted-foreground">
            {desenhando
              ? `Marque na prancha o que você quer mudar. Cada marcação pede um texto.${motivoSemCota ? ` Cota indisponível: ${motivoSemCota}` : ""}`
              : rotuloLeitura}
          </p>
        ) : null}
        <div
          ref={colunaRef}
          tabIndex={0}
          role="region"
          aria-label="Prancha"
          className="min-h-0 flex-1 overflow-auto bg-muted/40 p-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          style={{ touchAction: "pan-x pan-y" }}
        >
          {erro ? (
            <p role="alert" className="py-10 text-center text-sm text-destructive-text">
              {erro}
            </p>
          ) : !pdf ? (
            <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando a prancha…
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                <PdfPagina key={n} pdf={pdf} pagina={n} largura={Math.round(larguraAlvo * zoom)}>
                  {(dim) => (
                    <CamadaPagina
                      pagina={n}
                      dim={dim}
                      desenhando={desenhando}
                      ferramenta={ferramenta}
                      calibracao={calibracaoDa(n)}
                      leitura={leitura.filter((m) => m.pagina === n)}
                      rascunho={rascunho.marcacoes.map((m, i) => ({ m, numero: i + 1 })).filter(({ m }) => m.pagina === n)}
                      onNova={(x) => {
                        if (rascunho.marcacoes.length >= MAX_MARCACOES) {
                          toast.error(`O pedido aceita no máximo ${MAX_MARCACOES} marcações.`);
                          return;
                        }
                        setTextoNova("");
                        setNova(x);
                      }}
                    />
                  )}
                </PdfPagina>
              ))}
            </div>
          )}
        </div>
      </div>

      {desenhando && (
        <aside className="hidden min-h-0 overflow-y-auto rounded-lg border bg-card p-3 lg:block" aria-label="Pedido de revisão">
          {painel}
        </aside>
      )}

      <Sheet open={folhaAberta} onOpenChange={setFolhaAberta}>
        <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Pedido de revisão</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">{painel}</div>
        </SheetContent>
      </Sheet>

      <Dialog open={nova !== null} onOpenChange={(o) => !o && setNova(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>O que mudar aqui?</DialogTitle>
            <DialogDescription>O texto vai junto da marcação para a equipe.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={idTextoNova} className="sr-only">
              Texto da marcação
            </Label>
            <textarea
              id={idTextoNova}
              autoFocus
              rows={3}
              maxLength={LIMITE_TEXTO_MARCACAO}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              value={textoNova}
              onChange={(e) => setTextoNova(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNova(null)}>
              Descartar marcação
            </Button>
            <Button onClick={confirmarNova} disabled={!textoNova.trim()}>
              Guardar marcação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
