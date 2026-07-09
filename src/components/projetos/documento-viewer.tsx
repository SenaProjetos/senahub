"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// pdf.js é carregado dinamicamente no cliente (evita SSR e mantém o chunk fora do bundle inicial).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

/**
 * Visualizador de PDF SOMENTE-LEITURA para documentos do cliente (Recebidos) e do
 * Geral. Renderiza as páginas com pdf.js e permite zoom — mas NÃO tem camada de
 * apontamentos/pinos (diferente do `PdfViewer`, que é para validar entregáveis).
 */
export function DocumentoViewer({ url }: { url: string }) {
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [larguraAlvo, setLarguraAlvo] = useState(800);
  const [zoom, setZoom] = useState(1);
  const colunaRef = useRef<HTMLDivElement | null>(null);

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 5;
  const ajustarZoom = useCallback((delta: number) => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
  }, []);

  useEffect(() => {
    let cancelado = false;
    let doc: PdfDoc | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        doc = await pdfjs.getDocument({ url }).promise;
        if (cancelado) {
          doc?.destroy?.();
          return;
        }
        setPdf(doc);
        setNumPages(doc.numPages);
      } catch (e) {
        console.error("[documento-viewer] falha ao carregar PDF:", e);
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
  }, [url]);

  useEffect(() => {
    const el = colunaRef.current;
    if (!el) return;
    const medir = () => setLarguraAlvo(Math.max(320, Math.min(el.clientWidth - 24, 1100)));
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
      ajustarZoom(e.deltaY < 0 ? 0.2 : -0.2);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ajustarZoom]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-1 border-b px-2 py-1.5">
        <Button variant="outline" size="icon" className="size-7" onClick={() => ajustarZoom(-0.2)} aria-label="Diminuir zoom">
          <ZoomOut className="size-3.5" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <Button variant="outline" size="icon" className="size-7" onClick={() => ajustarZoom(0.2)} aria-label="Aumentar zoom">
          <ZoomIn className="size-3.5" />
        </Button>
      </div>
      <div ref={colunaRef} className="flex-1 overflow-auto bg-muted/40 p-3">
        {erro ? (
          <p className="py-10 text-center text-sm text-destructive">{erro}</p>
        ) : !pdf ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando PDF…
          </p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {Array.from({ length: numPages }, (_, i) => (
              <PaginaPdf key={i + 1} pdf={pdf} pagina={i + 1} largura={larguraAlvo * zoom} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PaginaPdf({ pdf, pagina, largura }: { pdf: PdfDoc; pagina: number; largura: number }) {
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
        if (!cancelado) console.debug("[documento-viewer] render pág.", pagina, e);
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

  return (
    <div className={cn("mx-auto shadow-sm", !dim && "min-h-40 w-full max-w-2xl")} style={{ width: dim?.w }}>
      <canvas ref={canvasRef} className="block bg-white" />
    </div>
  );
}
