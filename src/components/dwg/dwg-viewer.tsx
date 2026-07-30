"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Primitiva, CenaDwg } from "@/modules/dwg/parse";
import {
  bbox,
  ajustarParaVisualizar,
  aplicarZoom,
  aplicarPan,
  mundoParaTela,
  type Transform,
} from "@/modules/dwg/viewer/canvas-render";

const SEGMENTOS_ARCO = 32;
const COR_TRACO = "#111827";
const COR_FUNDO = "#ffffff";

/** Amostra pontos (mundo) ao longo do arco de `a0`→`a1` graus (sentido do DXF: anti-horário). */
function pontosDoArco(centro: { x: number; y: number }, raio: number, a0: number, a1: number): { x: number; y: number }[] {
  let fim = a1;
  while (fim < a0) fim += 360; // varredura sempre crescente (a0 → a1 anti-horário)
  const pontos: { x: number; y: number }[] = [];
  for (let i = 0; i <= SEGMENTOS_ARCO; i++) {
    const ang = ((a0 + ((fim - a0) * i) / SEGMENTOS_ARCO) * Math.PI) / 180;
    pontos.push({ x: centro.x + raio * Math.cos(ang), y: centro.y + raio * Math.sin(ang) });
  }
  return pontos;
}

function desenharCena(
  ctx: CanvasRenderingContext2D,
  primitivas: readonly Primitiva[],
  transform: Transform,
  camadasOcultas: ReadonlySet<string>,
  larguraPx: number,
  alturaPx: number,
) {
  ctx.save();
  ctx.fillStyle = COR_FUNDO;
  ctx.fillRect(0, 0, larguraPx, alturaPx);
  ctx.strokeStyle = COR_TRACO;
  ctx.fillStyle = COR_TRACO;
  ctx.lineWidth = 1;

  for (const p of primitivas) {
    if (camadasOcultas.has(p.camada)) continue;
    switch (p.tipo) {
      case "linha": {
        const a = mundoParaTela(p.p1, transform);
        const b = mundoParaTela(p.p2, transform);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        break;
      }
      case "circulo": {
        const c = mundoParaTela(p.centro, transform);
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(p.raio * transform.escala, 0.5), 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "arco": {
        const pts = pontosDoArco(p.centro, p.raio, p.a0, p.a1).map((pt) => mundoParaTela(pt, transform));
        ctx.beginPath();
        pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.stroke();
        break;
      }
      case "polilinha": {
        if (p.pontos.length < 2) break;
        const pts = p.pontos.map((pt) => mundoParaTela(pt, transform));
        ctx.beginPath();
        pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        if (p.fechada) ctx.closePath();
        ctx.stroke();
        break;
      }
      case "texto": {
        // Simplificação conhecida: rotação do texto ignorada no render (V1).
        const pt = mundoParaTela(p.p, transform);
        const alturaPx2 = Math.max(p.altura * transform.escala, 6);
        ctx.font = `${alturaPx2}px sans-serif`;
        ctx.fillText(p.conteudo, pt.x, pt.y);
        break;
      }
    }
  }
  ctx.restore();
}

export function DwgViewer({
  url,
  onCena,
  onCamadasVisiveisChange,
}: {
  url: string;
  /** Aditivo: a cena assim que carrega — usado por consumidores que precisam da geometria
   *  crua (ex.: custos/quantitativos, soma de comprimento/área por camada). */
  onCena?: (cena: CenaDwg) => void;
  /** Aditivo: nomes das camadas VISÍVEIS toda vez que o usuário alterna um checkbox. */
  onCamadasVisiveisChange?: (camadasVisiveis: string[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cenaRef = useRef<CenaDwg | null>(null);
  const transformRef = useRef<Transform | null>(null);
  const camadasOcultasRef = useRef<Set<string>>(new Set());
  const arrastoRef = useRef<{ x: number; y: number } | null>(null);

  const [cena, setCena] = useState<CenaDwg | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [camadasOcultas, setCamadasOcultas] = useState<Set<string>>(new Set());

  // Mesmo padrão de viewer-3d.tsx: callbacks lidos via ref para não recriar o effect de
  // carregamento (dep array `[url]`) a cada render por causa de uma arrow function inline.
  const callbacksRef = useRef({ onCena, onCamadasVisiveisChange });
  callbacksRef.current = { onCena, onCamadasVisiveisChange };

  const redesenhar = useCallback(() => {
    const canvas = canvasRef.current;
    const t = transformRef.current;
    const c = cenaRef.current;
    if (!canvas || !t || !c) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    desenharCena(ctx, c.primitivas, t, camadasOcultasRef.current, canvas.width / dpr, canvas.height / dpr);
  }, []);

  const enquadrar = useCallback(() => {
    const canvas = canvasRef.current;
    const c = cenaRef.current;
    if (!canvas || !c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const caixa = bbox(c.primitivas);
    if (!caixa) return;
    transformRef.current = ajustarParaVisualizar(caixa, canvas.width / dpr, canvas.height / dpr);
    redesenhar();
  }, [redesenhar]);

  // Carrega o DXF (fetch) e o parser (import dinâmico — mantém `dxf-parser` fora
  // do bundle inicial, mesmo padrão de `documento-viewer.tsx` com `pdfjs-dist`).
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [DxfParserMod, parseMod, res] = await Promise.all([
          import("dxf-parser"),
          import("@/modules/dwg/parse"),
          fetch(url),
        ]);
        if (!res.ok) throw new Error(`Falha ao buscar o DXF (${res.status}).`);
        const texto = await res.text();
        const DxfParser = DxfParserMod.default;
        const parser = new DxfParser();
        const parsed = parser.parseSync(texto);
        if (!parsed) throw new Error("DXF vazio ou inválido.");
        const c = parseMod.converterParaCena(parsed);
        if (cancelado) return;
        cenaRef.current = c;
        setCena(c);
        callbacksRef.current.onCena?.(c);
        callbacksRef.current.onCamadasVisiveisChange?.(c.camadas.map((camada) => camada.nome));
      } catch (e) {
        console.error("[dwg-viewer] falha ao carregar DXF:", e);
        if (!cancelado) setErro("Não foi possível carregar o desenho.");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [url]);

  // Dimensiona o canvas ao container (com devicePixelRatio) e enquadra a cena
  // assim que ela chega ou o container muda de tamanho.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const medir = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!transformRef.current && cenaRef.current) enquadrar();
      else redesenhar();
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(container);
    return () => ro.disconnect();
  }, [cena, enquadrar, redesenhar]);

  useEffect(() => {
    camadasOcultasRef.current = camadasOcultas;
    redesenhar();
  }, [camadasOcultas, redesenhar]);

  // Pan (arrasto) + zoom (wheel), sobre o canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      arrastoRef.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const inicio = arrastoRef.current;
      if (!inicio || !transformRef.current) return;
      const dx = e.clientX - inicio.x;
      const dy = e.clientY - inicio.y;
      arrastoRef.current = { x: e.clientX, y: e.clientY };
      transformRef.current = aplicarPan(transformRef.current, dx, dy);
      redesenhar();
    };
    const onPointerUp = (e: PointerEvent) => {
      arrastoRef.current = null;
      canvas.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      if (!transformRef.current) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const pivot = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const fator = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      transformRef.current = aplicarZoom(transformRef.current, fator, pivot);
      redesenhar();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [redesenhar]);

  function alternarCamada(nome: string) {
    setCamadasOcultas((atual) => {
      const novo = new Set(atual);
      if (novo.has(nome)) novo.delete(nome);
      else novo.add(nome);
      const todas = cenaRef.current?.camadas.map((c) => c.nome) ?? [];
      callbacksRef.current.onCamadasVisiveisChange?.(todas.filter((n) => !novo.has(n)));
      return novo;
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {cena?.camadas.map((c) => (
            <label key={c.nome} className="flex items-center gap-1">
              <Checkbox
                className="size-3.5"
                checked={!camadasOcultas.has(c.nome)}
                onCheckedChange={() => alternarCamada(c.nome)}
                aria-label={`Camada ${c.nome}`}
              />
              {c.nome}
            </label>
          ))}
        </div>
        <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={enquadrar} aria-label="Enquadrar desenho" title="Enquadrar">
          <Maximize className="size-3.5" />
        </Button>
      </div>
      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-muted/40">
        {erro ? (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-destructive">{erro}</p>
        ) : !cena ? (
          <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando desenho…
          </p>
        ) : null}
        <canvas ref={canvasRef} className="touch-none" />
      </div>
    </div>
  );
}
