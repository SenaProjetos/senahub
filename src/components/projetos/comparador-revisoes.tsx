"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PdfPagina } from "@/components/pdf/pdf-pagina";
import { DiffRevisoes } from "@/components/projetos/diff-revisoes";
import { CortinaRevisoes } from "@/components/projetos/cortina-revisoes";
import { rotuloRevisao } from "@/lib/utils";
import type { RevisaoDocumento } from "@/modules/uploads/queries";

// pdf.js é carregado dinamicamente no cliente.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

const downloadUrl = (uploadId: string) => `/api/uploads/${uploadId}/download?disposition=inline`;

/** Carrega um documento pdf.js a partir do uploadId; `null` enquanto carrega. */
function useDocumento(uploadId: string | null) {
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!uploadId) {
      setPdf(null);
      return;
    }
    let cancelado = false;
    let doc: PdfDoc | null = null;
    setPdf(null);
    setErro(null);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        doc = await pdfjs.getDocument({ url: downloadUrl(uploadId) }).promise;
        if (cancelado) {
          doc?.destroy?.();
          return;
        }
        setPdf(doc);
        setNumPages(doc.numPages);
      } catch (e) {
        console.error("[comparador] falha ao carregar PDF:", e);
        if (!cancelado) setErro("Não foi possível carregar este PDF.");
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
  }, [uploadId]);
  return { pdf, numPages, erro };
}

/**
 * Uma página tingida (vermelho ou azul) + fundo branco preservado — a técnica clássica de
 * "revision cloud compare" do CAD. Não reusa `PdfPagina` (que não expõe pixels): lê de volta
 * o canvas renderizado e interpola cada pixel entre BRANCO (luminância 1, fundo da página) e
 * a COR do lado (luminância 0, tinta) — assim sobrepor A(vermelho, multiply) + B(azul,
 * multiply) faz tinta que só existe num lado aparecer na cor dele, e tinta que existe nos
 * dois lados (não mudou) cair pra um cinza/preto neutro.
 */
async function renderTintado(
  canvas: HTMLCanvasElement,
  page: { getViewport: (o: { scale: number }) => { width: number; height: number } },
  viewport: { width: number; height: number },
  cor: [number, number, number],
) {
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.floor(viewport.width));
  off.height = Math.max(1, Math.floor(viewport.height));
  const octx = off.getContext("2d");
  if (!octx) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (page as any).render({ canvasContext: octx, viewport }).promise;
  const img = octx.getImageData(0, 0, off.width, off.height);
  const d = img.data;
  const [r, g, b] = cor;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
    d[i] = r + (255 - r) * lum;
    d[i + 1] = g + (255 - g) * lum;
    d[i + 2] = b + (255 - b) * lum;
  }
  canvas.width = off.width;
  canvas.height = off.height;
  canvas.style.width = `${off.width}px`;
  canvas.style.height = `${off.height}px`;
  canvas.getContext("2d")?.putImageData(img, 0, 0);
}

const COR_A: [number, number, number] = [220, 38, 38]; // vermelho — igual ao token --color-destructive
const COR_B: [number, number, number] = [37, 99, 235]; // azul

function PaginaSobreposta({
  pdfA,
  pdfB,
  pagina,
  largura,
  opacidadeB,
}: {
  pdfA: PdfDoc;
  pdfB: PdfDoc;
  pagina: number;
  largura: number;
  opacidadeB: number;
}) {
  const canvasARef = useRef<HTMLCanvasElement | null>(null);
  const canvasBRef = useRef<HTMLCanvasElement | null>(null);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [pageA, pageB] = await Promise.all([pdfA.getPage(pagina), pdfB.getPage(pagina)]);
        const baseA = pageA.getViewport({ scale: 1 });
        const scale = largura / baseA.width;
        const vpA = pageA.getViewport({ scale });
        const vpB = pageB.getViewport({ scale });
        if (cancelado) return;
        setDim({ w: Math.floor(Math.max(vpA.width, vpB.width)), h: Math.floor(Math.max(vpA.height, vpB.height)) });
        if (canvasARef.current) await renderTintado(canvasARef.current, pageA, vpA, COR_A);
        if (cancelado) return;
        if (canvasBRef.current) await renderTintado(canvasBRef.current, pageB, vpB, COR_B);
      } catch (e) {
        if (!cancelado) console.debug("[comparador] falha ao tingir pág.", pagina, e);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [pdfA, pdfB, pagina, largura]);

  return (
    <div className="relative mx-auto shadow-sm" style={{ width: dim?.w, height: dim?.h }}>
      <canvas ref={canvasARef} className="absolute inset-0 block bg-white" />
      <canvas
        ref={canvasBRef}
        className="absolute inset-0 block"
        style={{ opacity: opacidadeB, mixBlendMode: "multiply" }}
      />
    </div>
  );
}

export function ComparadorRevisoes({
  projetoId,
  uploadIdOrigem,
  nomeArquivo,
  revisoes,
}: {
  projetoId: string;
  uploadIdOrigem: string;
  nomeArquivo: string;
  revisoes: RevisaoDocumento[];
}) {
  const ordenadas = revisoes.slice().sort((a, b) => b.versao - a.versao);
  const [uploadA, setUploadA] = useState(uploadIdOrigem);
  const [uploadB, setUploadB] = useState(() => {
    const idx = ordenadas.findIndex((r) => r.uploadId === uploadIdOrigem);
    return ordenadas[idx + 1]?.uploadId ?? ordenadas.find((r) => r.uploadId !== uploadIdOrigem)?.uploadId ?? uploadIdOrigem;
  });
  const [modo, setModo] = useState<"lado-a-lado" | "sobreposicao" | "cortina" | "diferencas">("lado-a-lado");
  const [pagina, setPagina] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [opacidadeB, setOpacidadeB] = useState(0.6);
  const colunaRef = useRef<HTMLDivElement | null>(null);
  const [larguraAlvo, setLarguraAlvo] = useState(700);
  const painelARef = useRef<HTMLDivElement | null>(null);
  const painelBRef = useRef<HTMLDivElement | null>(null);
  // Espelha o scroll de um painel no outro no modo lado-a-lado. Sem esta trava, o `scrollTop`
  // ajustado no painel destino dispararia o `onScroll` dele, que tentaria realimentar o painel
  // de origem — um laço infinito de eventos.
  const sincronizandoScrollRef = useRef(false);
  const sincronizarScroll = useCallback((origem: "A" | "B") => {
    if (sincronizandoScrollRef.current) return;
    const fonte = origem === "A" ? painelARef.current : painelBRef.current;
    const destino = origem === "A" ? painelBRef.current : painelARef.current;
    if (!fonte || !destino) return;
    sincronizandoScrollRef.current = true;
    destino.scrollTop = fonte.scrollTop;
    destino.scrollLeft = fonte.scrollLeft;
    // O evento `scroll` que essa atribuição dispara no destino é assíncrono (não sincrônico
    // como um `.click()`) — liberar a trava só no próximo frame garante que o eco ainda a
    // encontre travada. Liberar aqui mesmo (síncrono) a tornaria inútil.
    requestAnimationFrame(() => {
      sincronizandoScrollRef.current = false;
    });
  }, []);

  const docA = useDocumento(uploadA);
  const docB = useDocumento(uploadB);
  const numPages = Math.max(docA.numPages, docB.numPages, 1);

  useEffect(() => {
    const el = colunaRef.current;
    if (!el) return;
    const medir = () => setLarguraAlvo(Math.max(280, Math.min((el.clientWidth - 40) / (modo === "lado-a-lado" ? 2 : 1), 1000)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [modo]);

  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 3;
  const ajustarZoom = useCallback((delta: number) => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
  }, []);

  useEffect(() => setPagina((p) => Math.min(p, numPages)), [numPages]);

  // Ctrl+scroll dentro de um painel do modo lado-a-lado ajusta o zoom compartilhado (aplica
  // nos dois painéis, já que `zoom` é um único state). Listener nativo (não o `onWheel` do
  // React) porque handlers de wheel são passivos por padrão em React — `preventDefault()`
  // dentro do synthetic event geraria warning e não bloquearia o scroll/zoom nativo do navegador.
  useEffect(() => {
    // Os painéis só entram no DOM (refs deixam de ser null) depois que os dois PDFs terminam
    // de carregar — por isso o guard usa `docA.pdf`/`docB.pdf` em vez de só `modo`.
    if (modo !== "lado-a-lado" || !docA.pdf || !docB.pdf) return;
    const paineis = [painelARef.current, painelBRef.current].filter((el): el is HTMLDivElement => !!el);
    if (paineis.length === 0) return;
    const aoRolar = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      ajustarZoom(e.deltaY < 0 ? 0.1 : -0.1);
    };
    paineis.forEach((el) => el.addEventListener("wheel", aoRolar, { passive: false }));
    return () => paineis.forEach((el) => el.removeEventListener("wheel", aoRolar));
  }, [modo, ajustarZoom, docA.pdf, docB.pdf]);

  const rotulo = (r: RevisaoDocumento) => `${rotuloRevisao(r.versao)}${r.excluido ? " (excluída)" : ""}`;

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b pb-3">
        <Link
          href={`/projetos/${projetoId}/arquivos/${uploadIdOrigem}/visualizar`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Voltar
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">Comparar revisões — {nomeArquivo}</h1>
        </div>
        <Tabs value={modo} onValueChange={(v) => v && setModo(v as typeof modo)}>
          <TabsList>
            <TabsTrigger value="lado-a-lado">Lado a lado</TabsTrigger>
            <TabsTrigger value="sobreposicao">Sobreposição</TabsTrigger>
            <TabsTrigger value="cortina">Cortina</TabsTrigger>
            <TabsTrigger value="diferencas">Diferenças</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b py-2">
        <span className="text-xs font-medium text-destructive">A</span>
        <Select value={uploadA} onValueChange={(v) => v && setUploadA(v)}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ordenadas.map((r) => (
              <SelectItem key={r.uploadId} value={r.uploadId}>{rotulo(r)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs font-medium text-blue-600">B</span>
        <Select value={uploadB} onValueChange={(v) => v && setUploadB(v)}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ordenadas.map((r) => (
              <SelectItem key={r.uploadId} value={r.uploadId}>{rotulo(r)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="mx-1 h-5 w-px bg-border" />
        <Button size="icon" variant="ghost" className="size-7" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} aria-label="Página anterior">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="w-16 text-center text-xs tabular-nums text-muted-foreground">pág. {pagina} / {numPages}</span>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => setPagina((p) => Math.min(numPages, p + 1))} disabled={pagina >= numPages} aria-label="Próxima página">
          <ChevronRight className="size-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />
        <Button size="icon" variant="ghost" className="size-7" onClick={() => ajustarZoom(-0.2)} disabled={zoom <= ZOOM_MIN} aria-label="Diminuir zoom">
          <ZoomOut className="size-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => ajustarZoom(0.2)} disabled={zoom >= ZOOM_MAX} aria-label="Aumentar zoom">
          <ZoomIn className="size-4" />
        </Button>

        {modo === "sobreposicao" && (
          <>
            <div className="mx-1 h-5 w-px bg-border" />
            <span className="text-xs text-muted-foreground">Opacidade B</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opacidadeB}
              onChange={(e) => setOpacidadeB(+e.target.value)}
              className="w-28 cursor-pointer accent-primary"
              aria-label="Opacidade da revisão B"
            />
            <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{Math.round(opacidadeB * 100)}%</span>
          </>
        )}
      </div>

      <div ref={colunaRef} className="flex-1 overflow-auto bg-muted/30 p-4">
        {docA.erro || docB.erro ? (
          <p className="py-10 text-center text-sm text-destructive">{docA.erro ?? docB.erro}</p>
        ) : !docA.pdf || !docB.pdf ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando as duas revisões…
          </p>
        ) : modo === "lado-a-lado" ? (
          <div className="grid h-full grid-cols-2 gap-4">
            <div
              ref={painelARef}
              onScroll={() => sincronizarScroll("A")}
              className="h-full overflow-auto"
            >
              <p className="mb-1 text-center text-xs font-medium text-destructive">{rotulo(ordenadas.find((r) => r.uploadId === uploadA)!)}</p>
              <PdfPagina pdf={docA.pdf} pagina={Math.min(pagina, docA.numPages || 1)} largura={larguraAlvo * zoom} />
            </div>
            <div
              ref={painelBRef}
              onScroll={() => sincronizarScroll("B")}
              className="h-full overflow-auto"
            >
              <p className="mb-1 text-center text-xs font-medium text-blue-600">{rotulo(ordenadas.find((r) => r.uploadId === uploadB)!)}</p>
              <PdfPagina pdf={docB.pdf} pagina={Math.min(pagina, docB.numPages || 1)} largura={larguraAlvo * zoom} />
            </div>
          </div>
        ) : modo === "cortina" ? (
          <CortinaRevisoes
            pdfA={docA.pdf}
            pdfB={docB.pdf}
            rotuloA={rotulo(ordenadas.find((r) => r.uploadId === uploadA)!)}
            rotuloB={rotulo(ordenadas.find((r) => r.uploadId === uploadB)!)}
            pagina={Math.min(pagina, Math.min(docA.numPages || 1, docB.numPages || 1))}
            largura={larguraAlvo * zoom}
          />
        ) : modo === "diferencas" ? (
          <DiffRevisoes
            pdfA={docA.pdf}
            pdfB={docB.pdf}
            paginasA={docA.numPages}
            paginasB={docB.numPages}
            pagina={pagina}
            largura={larguraAlvo * zoom}
          />
        ) : (
          <div>
            <p className="mb-2 text-center text-xs text-muted-foreground">
              <span className="font-medium text-destructive">vermelho</span> = só em A ·{" "}
              <span className="font-medium text-blue-600">azul</span> = só em B · escuro = igual nos dois
            </p>
            <PaginaSobreposta
              pdfA={docA.pdf}
              pdfB={docB.pdf}
              pagina={Math.min(pagina, Math.min(docA.numPages || 1, docB.numPages || 1))}
              largura={larguraAlvo * zoom}
              opacidadeB={opacidadeB}
            />
          </div>
        )}
      </div>
    </div>
  );
}
