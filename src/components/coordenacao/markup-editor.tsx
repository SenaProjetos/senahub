"use client";

import { useEffect, useRef, useState } from "react";
import { MousePointer2, ArrowUpRight, Circle, Type, Undo2 } from "lucide-react";
import {
  criarSeta,
  criarCirculo,
  criarTexto,
  formaValida,
  type Forma,
  type Ponto2D,
} from "@/modules/coordenacao/markup";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Ferramenta = "seta" | "circulo" | "texto" | null;

const COR = "#f59e0b"; // aviso — mesma cor usada em medição/pins, chamativa sobre o modelo

function desenharSeta(ctx: CanvasRenderingContext2D, inicio: Ponto2D, fim: Ponto2D) {
  ctx.beginPath();
  ctx.moveTo(inicio.x, inicio.y);
  ctx.lineTo(fim.x, fim.y);
  ctx.stroke();
  const angulo = Math.atan2(fim.y - inicio.y, fim.x - inicio.x);
  const tam = 16;
  ctx.beginPath();
  ctx.moveTo(fim.x, fim.y);
  ctx.lineTo(fim.x - tam * Math.cos(angulo - Math.PI / 6), fim.y - tam * Math.sin(angulo - Math.PI / 6));
  ctx.moveTo(fim.x, fim.y);
  ctx.lineTo(fim.x - tam * Math.cos(angulo + Math.PI / 6), fim.y - tam * Math.sin(angulo + Math.PI / 6));
  ctx.stroke();
}

function desenharForma(ctx: CanvasRenderingContext2D, forma: Forma) {
  ctx.strokeStyle = COR;
  ctx.fillStyle = COR;
  ctx.lineWidth = 3;
  if (forma.tipo === "seta") {
    desenharSeta(ctx, forma.inicio, forma.fim);
  } else if (forma.tipo === "circulo") {
    ctx.beginPath();
    ctx.arc(forma.centro.x, forma.centro.y, forma.raio, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.font = "bold 26px sans-serif";
    ctx.fillText(forma.texto, forma.posicao.x, forma.posicao.y);
  }
}

/**
 * Editor de marcações sobre o snapshot do apontamento: seta/círculo/texto, desenhados
 * direto no canvas e achatados no PNG final. "Cancelar" não anexa snapshot algum
 * (mesmo comportamento de antes desta ferramenta existir); "Salvar" sempre envia o
 * canvas atual (com ou sem marcações).
 */
export function MarkupEditor({
  aberto,
  imagem,
  onSalvar,
  onCancelar,
}: {
  aberto: boolean;
  imagem: Blob | null;
  onSalvar: (blob: Blob) => void;
  onCancelar: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [formas, setFormas] = useState<Forma[]>([]);
  const [ferramenta, setFerramenta] = useState<Ferramenta>(null);
  const [inicioArraste, setInicioArraste] = useState<Ponto2D | null>(null);

  useEffect(() => {
    if (!imagem || !aberto) return;
    setFormas([]);
    setFerramenta(null);
    const url = URL.createObjectURL(imagem);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      redesenhar([]);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagem, aberto]);

  function redesenhar(extra: Forma[]) {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !img || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    for (const f of [...formas, ...extra]) desenharForma(ctx, f);
  }

  useEffect(() => {
    redesenhar([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formas]);

  function coordsDoEvento(e: React.PointerEvent<HTMLCanvasElement>): Ponto2D {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!ferramenta) return;
    const p = coordsDoEvento(e);
    if (ferramenta === "texto") {
      const texto = window.prompt("Texto da marcação:");
      if (texto?.trim()) {
        const forma = criarTexto(p, texto.trim());
        if (formaValida(forma)) setFormas((fs) => [...fs, forma]);
      }
      return;
    }
    setInicioArraste(p);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!inicioArraste || ferramenta === "texto" || !ferramenta) return;
    const p = coordsDoEvento(e);
    const preview = ferramenta === "seta" ? criarSeta(inicioArraste, p) : criarCirculo(inicioArraste, p);
    redesenhar([preview]);
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!inicioArraste || !ferramenta || ferramenta === "texto") {
      setInicioArraste(null);
      return;
    }
    const p = coordsDoEvento(e);
    const forma = ferramenta === "seta" ? criarSeta(inicioArraste, p) : criarCirculo(inicioArraste, p);
    setInicioArraste(null);
    if (formaValida(forma)) setFormas((fs) => [...fs, forma]);
    else redesenhar([]);
  }

  function desfazer() {
    setFormas((fs) => fs.slice(0, -1));
  }

  function salvar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) onSalvar(blob);
    }, "image/png");
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onCancelar()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Marcar o snapshot</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="icon"
            variant={ferramenta === null ? "secondary" : "outline"}
            className="size-8"
            title="Selecionar (sem desenhar)"
            onClick={() => setFerramenta(null)}
          >
            <MousePointer2 className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={ferramenta === "seta" ? "secondary" : "outline"}
            className="size-8"
            title="Seta"
            onClick={() => setFerramenta("seta")}
          >
            <ArrowUpRight className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={ferramenta === "circulo" ? "secondary" : "outline"}
            className="size-8"
            title="Círculo"
            onClick={() => setFerramenta("circulo")}
          >
            <Circle className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={ferramenta === "texto" ? "secondary" : "outline"}
            className="size-8"
            title="Texto"
            onClick={() => setFerramenta("texto")}
          >
            <Type className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8"
            title="Desfazer última marcação"
            onClick={desfazer}
            disabled={formas.length === 0}
          >
            <Undo2 className="size-4" />
          </Button>
        </div>
        <div className="overflow-auto rounded border bg-muted/30">
          <canvas
            ref={canvasRef}
            className={cn("max-w-full", ferramenta && ferramenta !== "texto" && "cursor-crosshair")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancelar}>
            Cancelar (sem snapshot)
          </Button>
          <Button type="button" onClick={salvar}>
            Salvar snapshot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
