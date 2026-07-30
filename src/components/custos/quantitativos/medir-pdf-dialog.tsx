"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { escalaPorReferencia, comprimentoPolilinha, areaPoligono, type Ponto } from "@/modules/custos/quantitativos/medicao-pdf";
import { registrarQuantitativo } from "@/modules/custos/quantitativos/actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

export type PdfOpcao = { uploadId: string; nomeArquivo: string; disciplinaNome: string };

export function MedirPdfDialog({
  orcamentoId,
  pdfs,
  open,
  onOpenChange,
}: {
  orcamentoId: string;
  pdfs: PdfOpcao[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [uploadId, setUploadId] = useState("");
  const [pagina, setPagina] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);

  const [modo, setModo] = useState<"regua" | "medir">("regua");
  const [pontosEscala, setPontosEscala] = useState<Ponto[]>([]);
  const [medidaReal, setMedidaReal] = useState("");
  const [escala, setEscala] = useState<number | null>(null);
  const [pontosMedicao, setPontosMedicao] = useState<Ponto[]>([]);
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    if (!uploadId) return;
    let cancelado = false;
    let doc: PdfDoc | null = null;
    setPdf(null);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        doc = await pdfjs.getDocument({ url: `/api/uploads/${uploadId}/download?disposition=inline` }).promise;
        if (cancelado) {
          doc?.destroy?.();
          return;
        }
        setPdf(doc);
        setNumPages(doc.numPages);
        setPagina(1);
      } catch {
        toast.error("Não foi possível carregar o PDF.");
      }
    })();
    return () => {
      cancelado = true;
      doc?.destroy?.();
    };
  }, [uploadId]);

  // Renderiza a página + redesenha pontos/linhas por cima. UM efeito só — dois efeitos concorrentes
  // chamando page.render() no mesmo canvas fazem o pdf.js rejeitar a chamada mais antiga, e sem
  // guarda de cancelamento isso deixava `dim` nulo (canvas sem width/height → clique não mapeia certo).
  useEffect(() => {
    if (!pdf) return;
    let cancelado = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let task: any;
    (async () => {
      try {
        const page = await pdf.getPage(pagina);
        const viewport = page.getViewport({ scale: 1.3 });
        const canvas = canvasRef.current;
        if (!canvas || cancelado) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        task = page.render({ canvasContext: ctx, viewport });
        await task.promise;
        if (cancelado) return;
        setDim({ w: Math.floor(viewport.width), h: Math.floor(viewport.height) });

        function desenharPontos(contexto: CanvasRenderingContext2D, pontos: Ponto[], cor: string, fechar: boolean) {
          if (pontos.length === 0) return;
          contexto.strokeStyle = cor;
          contexto.fillStyle = cor;
          contexto.lineWidth = 2;
          contexto.beginPath();
          pontos.forEach((p, i) => (i === 0 ? contexto.moveTo(p.x, p.y) : contexto.lineTo(p.x, p.y)));
          if (fechar && pontos.length > 2) contexto.closePath();
          contexto.stroke();
          for (const p of pontos) {
            contexto.beginPath();
            contexto.arc(p.x, p.y, 4, 0, Math.PI * 2);
            contexto.fill();
          }
        }
        desenharPontos(ctx, pontosEscala, "#f59e0b", false);
        desenharPontos(ctx, pontosMedicao, "#2563eb", pontosMedicao.length > 2);
      } catch (e) {
        if (!cancelado) console.debug("[medir-pdf] render pág.", pagina, e);
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
  }, [pdf, pagina, pontosEscala, pontosMedicao]);

  function clicarCanvas(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const p: Ponto = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (modo === "regua") {
      if (pontosEscala.length >= 2) setPontosEscala([p]);
      else setPontosEscala((ps) => [...ps, p]);
    } else {
      setPontosMedicao((ps) => [...ps, p]);
    }
  }

  function confirmarEscala() {
    const real = Number(medidaReal.replace(",", "."));
    if (pontosEscala.length !== 2 || !Number.isFinite(real) || real <= 0) return;
    const distanciaPixels = Math.hypot(pontosEscala[1].x - pontosEscala[0].x, pontosEscala[1].y - pontosEscala[0].y);
    try {
      setEscala(escalaPorReferencia(distanciaPixels, real));
      setModo("medir");
      toast.success("Escala definida — agora clique os pontos da medição.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Régua inválida.");
    }
  }

  const comprimento = escala != null ? comprimentoPolilinha(pontosMedicao, escala) : 0;
  const area = escala != null && pontosMedicao.length > 2 ? areaPoligono(pontosMedicao, escala) : 0;

  function salvar(grandeza: "comprimento" | "area", quantidade: number) {
    if (!descricao.trim() || quantidade <= 0 || escala == null) return;
    startTransition(async () => {
      const r = await registrarQuantitativo({
        orcamentoId,
        descricao: descricao.trim(),
        grandeza,
        unidade: grandeza === "comprimento" ? "m" : "m²",
        quantidade,
        origem: "pdf",
        uploadId,
        pagina,
        ancoraJson: { pontos: pontosMedicao, escala },
        memoria: `Medido na prancha, página ${pagina}, com régua (escala ${escala.toFixed(4)} m/px).`,
      });
      if (r.ok) {
        toast.success("Levantamento gravado.");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function reiniciarMedicao() {
    setPontosMedicao([]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92svh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="border-b px-4 py-2">
          <DialogTitle className="text-sm">Medir na prancha (PDF)</DialogTitle>
          <DialogDescription className="text-xs">
            1. Marque a régua com uma medida conhecida. 2. Clique os pontos da medição.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <div className="flex-1 overflow-auto bg-muted/30 p-3">
            {!uploadId ? (
              <p className="mt-16 text-center text-sm text-muted-foreground">Escolha uma prancha ao lado.</p>
            ) : !pdf ? (
              <div className="mt-16 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Carregando prancha…
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                onClick={clicarCanvas}
                className="mx-auto block cursor-crosshair bg-white shadow"
                style={{ width: dim?.w, height: dim?.h }}
              />
            )}
          </div>

          <div className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l p-3">
            <div className="space-y-1.5">
              <Label>Prancha</Label>
              <Select
                value={uploadId}
                onValueChange={(v) => {
                  if (!v) return;
                  setUploadId(v);
                  setPontosEscala([]);
                  setPontosMedicao([]);
                  setEscala(null);
                  setModo("regua");
                  const p = pdfs.find((x) => x.uploadId === v);
                  setDescricao(p ? `Medição — ${p.nomeArquivo}` : "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o PDF" />
                </SelectTrigger>
                <SelectContent>
                  {pdfs.map((p) => (
                    <SelectItem key={p.uploadId} value={p.uploadId}>
                      {p.disciplinaNome} · {p.nomeArquivo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {numPages > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="pdf-pagina">Página</Label>
                <Input
                  id="pdf-pagina"
                  type="number"
                  min={1}
                  max={numPages}
                  value={pagina}
                  onChange={(e) => {
                    setPagina(Math.min(numPages, Math.max(1, Number(e.target.value) || 1)));
                    setPontosEscala([]);
                    setPontosMedicao([]);
                    setEscala(null);
                    setModo("regua");
                  }}
                />
              </div>
            )}

            {pdf && modo === "regua" && (
              <div className="space-y-2 rounded-sm border p-2 text-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Ruler className="size-3.5" /> Régua ({pontosEscala.length}/2 pontos)
                </p>
                <p className="text-[11px] text-muted-foreground">Clique 2 pontos com distância real conhecida (ex.: uma cota).</p>
                <div className="space-y-1.5">
                  <Label htmlFor="medida-real">Distância real (m)</Label>
                  <Input id="medida-real" inputMode="decimal" value={medidaReal} onChange={(e) => setMedidaReal(e.target.value)} placeholder="0,00" />
                </div>
                <Button size="sm" className="w-full" onClick={confirmarEscala} disabled={pontosEscala.length !== 2 || !medidaReal.trim()}>
                  Confirmar escala
                </Button>
              </div>
            )}

            {pdf && modo === "medir" && escala != null && (
              <div className="space-y-2 rounded-sm border p-2 text-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">Medição ({pontosMedicao.length} pontos)</p>
                  <Button size="sm" variant="ghost" onClick={reiniciarMedicao} className="h-6 gap-1 px-1.5 text-xs">
                    <RotateCcw className="size-3" /> limpar
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Escala: 1 px = {escala.toFixed(4)} m</p>

                <div className="space-y-1.5">
                  <Label htmlFor="pdf-descricao">Descrição</Label>
                  <Input id="pdf-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} />
                </div>

                <p className="font-mono text-xs">Comprimento: {comprimento.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m</p>
                <Button size="sm" variant="outline" className="w-full" onClick={() => salvar("comprimento", comprimento)} disabled={pending || comprimento <= 0 || !descricao.trim()}>
                  Gravar comprimento
                </Button>

                {pontosMedicao.length > 2 && (
                  <>
                    <p className="font-mono text-xs">Área: {area.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m²</p>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => salvar("area", area)} disabled={pending || area <= 0 || !descricao.trim()}>
                      Gravar área
                    </Button>
                  </>
                )}

                <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => setModo("regua")}>
                  Refazer a régua
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t px-4 py-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
