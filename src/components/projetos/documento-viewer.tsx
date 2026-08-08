"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfPagina } from "@/components/pdf/pdf-pagina";
import { usePdfBusca } from "@/components/pdf/use-pdf-busca";
import { BarraBuscaPdf } from "@/components/pdf/barra-busca-pdf";
import { usePdfCamadas } from "@/components/pdf/use-pdf-camadas";
import { CamadasPdf } from "@/components/pdf/camadas-pdf";
import { usePinchZoom } from "@/components/pdf/use-pinch-zoom";

// pdf.js é carregado dinamicamente no cliente (evita SSR e mantém o chunk fora do bundle inicial).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

/**
 * Visualizador de PDF SOMENTE-LEITURA para documentos do cliente (Recebidos), do Geral e
 * (via `PreviewPdfButton`) dos documentos de RH. Renderiza as páginas com pdf.js, permite
 * zoom e busca textual — mas NÃO tem camada de apontamentos/pinos (diferente do
 * `PdfViewer`, que é para validar entregáveis).
 */
export function DocumentoViewer({ url }: { url: string }) {
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [larguraAlvo, setLarguraAlvo] = useState(800);
  const [zoom, setZoom] = useState(1);
  const colunaRef = useRef<HTMLDivElement | null>(null);
  const paginaRefs = useRef(new Map<number, HTMLDivElement>());

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 5;
  const ajustarZoom = useCallback((delta: number) => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
  }, []);
  // Zoom por pinça de 2 dedos (item 34-touch). Sem pan por arraste aqui (usa scroll nativo do
  // navegador, ao contrário do PdfViewer) — só a pinça é custom.
  usePinchZoom(colunaRef, { zoom, setZoom, min: ZOOM_MIN, max: ZOOM_MAX });

  const busca = usePdfBusca(numPages);
  const camadas = usePdfCamadas(pdf);

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

  // Ao navegar pra uma ocorrência: rola até a página e, na sequência, até a marca exata.
  useEffect(() => {
    const atual = busca.ocorrenciaAtual;
    if (!atual) return;
    paginaRefs.current.get(atual.pagina)?.scrollIntoView({ behavior: "smooth", block: "start" });
    const id = atual.id;
    const t = setTimeout(() => {
      colunaRef.current?.querySelector(`[data-ocorrencia="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => clearTimeout(t);
  }, [busca.ocorrenciaAtual]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-end gap-1 border-b px-2 py-1.5">
        <BarraBuscaPdf
          query={busca.query}
          onQueryChange={busca.setQuery}
          total={busca.total}
          indiceAtual={busca.indiceAtual}
          pronto={busca.pronto}
          onProxima={busca.proxima}
          onAnterior={busca.anterior}
          className="flex items-center gap-1"
        />
        {camadas.temCamadas && (
          <>
            <div className="mx-1 h-5 w-px bg-border" />
            <CamadasPdf grupos={camadas.grupos} onAlternar={camadas.alternar} />
          </>
        )}
        <div className="mx-1 h-5 w-px bg-border" />
        <Button variant="outline" size="icon" className="size-7" onClick={() => ajustarZoom(-0.2)} aria-label="Diminuir zoom">
          <ZoomOut className="size-3.5" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <Button variant="outline" size="icon" className="size-7" onClick={() => ajustarZoom(0.2)} aria-label="Aumentar zoom">
          <ZoomIn className="size-3.5" />
        </Button>
      </div>
      {busca.query.trim() !== "" && busca.semTextoPesquisavel && (
        <div className="border-b bg-warning/10 px-3 py-1.5 text-xs text-warning">
          Este PDF não possui texto pesquisável (provavelmente um documento escaneado).
        </div>
      )}
      {/* pan-x/pan-y preservam o scroll nativo (não há pan por arraste aqui); só o
          pinch-zoom NATIVO é suprimido, pra não brigar com o `usePinchZoom`. */}
      <div ref={colunaRef} className="flex-1 overflow-auto bg-muted/40 p-3" style={{ touchAction: "pan-x pan-y" }}>
        {erro ? (
          <p className="py-10 text-center text-sm text-destructive">{erro}</p>
        ) : !pdf ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando PDF…
          </p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
              <PdfPagina
                key={n}
                registrar={(el) => {
                  if (el) paginaRefs.current.set(n, el);
                  else paginaRefs.current.delete(n);
                }}
                pdf={pdf}
                pagina={n}
                largura={larguraAlvo * zoom}
                onTexto={busca.registrarTexto}
                marcas={busca.ocorrenciasPorPagina(n)}
                ocgConfig={camadas.config}
                ocgVersao={camadas.versao}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
