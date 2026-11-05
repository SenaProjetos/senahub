"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  aplicar,
  caixaAplicada,
  compor,
  inverter,
  type Alinhamento,
  type Caixa,
  type Ponto,
} from "@/modules/coordenacao/sobreposicao/transformacao";
import { desenharDwg, type Matriz, type RenderDwg } from "./render-dwg";
import type { RenderPdf } from "./render-pdf";

/** Mundo → px CSS do palco. Giro sempre 0: tela = `aplicar(vista, mundo)`. */
export type VistaPalco = Alinhamento;

export type CamadaRenderizada = RenderPdf | RenderDwg;

/** Uma camada pronta para compor, já na ordem de desenho (base primeiro). */
export type CamadaNoPalco = {
  id: string;
  render: CamadaRenderizada;
  /** Nativo da camada → mundo (`alinhamentoEfetivo`). */
  alinhamento: Alinhamento;
  cor: string;
  opacidade: number;
  visivel: boolean;
};

export type PalcoHandle = {
  ajustar(): void;
  /** PNG de `larguraPx` × `alturaPx` centrado em `centroMundo`, no zoom atual. */
  paraImagem(centroMundo: Ponto, larguraPx: number, alturaPx: number): Promise<Blob>;
};

type Props = {
  camadas: CamadaNoPalco[];
  /** Caixa da base no mundo; sem ela, o ajuste usa a soma das camadas. */
  caixaMundo: Caixa | null;
  /** Clique sem arrastar, em coordenadas do mundo. */
  onPontoMundo?: (p: Ponto) => void;
  /** Desenhado por cima das camadas, com o contexto em px CSS (pinos, marcadores). */
  sobreposto?: (ctx: CanvasRenderingContext2D, vista: VistaPalco) => void;
  /** Zoom em % do "ajustar à tela". */
  onZoom?: (pct: number) => void;
  className?: string;
};

const MARGEM_AJUSTE = 24;
const FATOR_ZOOM = 1.15;
const ZOOM_MIN = 0.02;
const ZOOM_MAX = 200;
const ARRASTE_MINIMO = 4;

export function matrizDe(a: Alinhamento, fator = 1): Matriz {
  const rad = (a.giro * Math.PI) / 180;
  const c = Math.cos(rad) * a.escala * fator;
  const s = Math.sin(rad) * a.escala * fator;
  return [c, s, -s, c, a.tx * fator, a.ty * fator];
}

function caixaDasCamadas(camadas: CamadaNoPalco[]): Caixa | null {
  let soma: Caixa | null = null;
  for (const c of camadas) {
    const k = caixaAplicada(c.alinhamento, c.render.caixaNativa);
    soma = soma
      ? { minX: Math.min(soma.minX, k.minX), minY: Math.min(soma.minY, k.minY), maxX: Math.max(soma.maxX, k.maxX), maxY: Math.max(soma.maxY, k.maxY) }
      : k;
  }
  return soma;
}

function desenharCena(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  vista: VistaPalco,
  camadas: CamadaNoPalco[],
  sobreposto: Props["sobreposto"],
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (const c of camadas) {
    if (!c.visivel || c.opacidade <= 0) continue;
    ctx.globalAlpha = c.opacidade / 100;
    const m = matrizDe(compor(vista, c.alinhamento), dpr);
    if (c.render.formato === "pdf") {
      const k = 1 / c.render.escalaRaster;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.setTransform(m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4], m[5]);
      ctx.drawImage(c.render.imagem, 0, 0);
    } else {
      desenharDwg(ctx, c.render, m, c.cor, dpr);
    }
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sobreposto?.(ctx, vista);
}

/** Canvas da sobreposição: zoom pela roda sob o cursor, arrastar = pan, pinça no toque, duplo clique = ajustar. */
export const Palco = forwardRef<PalcoHandle, Props>(function Palco(
  { camadas, caixaMundo, onPontoMundo, sobreposto, onZoom, className },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vistaRef = useRef<VistaPalco>({ tx: 0, ty: 0, giro: 0, escala: 1 });
  const escalaAjusteRef = useRef(1);
  // Reenquadra sozinho até o mundo (a base) chegar ou a pessoa mexer no zoom/pan.
  const autoRef = useRef(true);
  const quadroRef = useRef<number | null>(null);
  // As props mais recentes, lidas pelos handlers e pelo quadro sem recriá-los.
  const atual = useRef({ camadas, caixaMundo, sobreposto, onZoom, onPontoMundo });
  useLayoutEffect(() => {
    atual.current = { camadas, caixaMundo, sobreposto, onZoom, onPontoMundo };
  });
  const zoomInformado = useRef<number | null>(null);

  const informarZoom = useCallback(() => {
    const pct = Math.round((vistaRef.current.escala / escalaAjusteRef.current) * 100);
    if (pct !== zoomInformado.current) {
      zoomInformado.current = pct;
      atual.current.onZoom?.(pct);
    }
  }, []);

  const redesenhar = useCallback(() => {
    if (quadroRef.current !== null) return;
    quadroRef.current = requestAnimationFrame(() => {
      quadroRef.current = null;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      desenharCena(ctx, window.devicePixelRatio || 1, vistaRef.current, atual.current.camadas, atual.current.sobreposto);
    });
  }, []);

  const ajustar = useCallback(() => {
    const canvas = canvasRef.current;
    const caixa = atual.current.caixaMundo ?? caixaDasCamadas(atual.current.camadas);
    if (!canvas || !caixa) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cw = caixa.maxX - caixa.minX;
    const ch = caixa.maxY - caixa.minY;
    if (w <= 0 || h <= 0 || cw <= 0 || ch <= 0) return;
    const escala = Math.max(Math.min((w - 2 * MARGEM_AJUSTE) / cw, (h - 2 * MARGEM_AJUSTE) / ch), 1e-9);
    escalaAjusteRef.current = escala;
    vistaRef.current = {
      tx: w / 2 - escala * (caixa.minX + cw / 2),
      ty: h / 2 - escala * (caixa.minY + ch / 2),
      giro: 0,
      escala,
    };
    autoRef.current = atual.current.caixaMundo === null;
    informarZoom();
    redesenhar();
  }, [informarZoom, redesenhar]);

  const zoomEm = useCallback(
    (fator: number, tela: Ponto) => {
      const v = vistaRef.current;
      const base = escalaAjusteRef.current;
      const escala = Math.min(Math.max(v.escala * fator, ZOOM_MIN * base), ZOOM_MAX * base);
      const r = escala / v.escala;
      autoRef.current = false;
      vistaRef.current = { tx: tela.x - (tela.x - v.tx) * r, ty: tela.y - (tela.y - v.ty) * r, giro: 0, escala };
      informarZoom();
      redesenhar();
    },
    [informarZoom, redesenhar],
  );

  // Tamanho do canvas acompanha o quadro (nitidez em telas de alta densidade).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (autoRef.current) ajustar();
      redesenhar();
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [ajustar, redesenhar]);

  // Camadas mudaram (carregou, cor, opacidade, olho): ajusta na primeira vez e redesenha.
  useEffect(() => {
    if (autoRef.current) ajustar();
    redesenhar();
  }, [camadas, caixaMundo, sobreposto, ajustar, redesenhar]);

  // Roda: precisa de listener não passivo para impedir a rolagem da página.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const aoRolar = (ev: WheelEvent) => {
      ev.preventDefault();
      const passos = (ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY) / 100;
      const r = canvas.getBoundingClientRect();
      zoomEm(Math.pow(FATOR_ZOOM, -passos), { x: ev.clientX - r.left, y: ev.clientY - r.top });
    };
    canvas.addEventListener("wheel", aoRolar, { passive: false });
    return () => canvas.removeEventListener("wheel", aoRolar);
  }, [zoomEm]);

  useEffect(
    () => () => {
      // Zera o pedido: no Strict Mode o efeito remonta, e um id antigo travaria todo quadro seguinte.
      if (quadroRef.current !== null) cancelAnimationFrame(quadroRef.current);
      quadroRef.current = null;
    },
    [],
  );

  // Arrastar (1 ponteiro) e pinça (2); clique sem arrastar vira ponto do mundo.
  const ponteiros = useRef(new Map<number, Ponto>());
  const gesto = useRef({ inicio: { x: 0, y: 0 }, moveu: false });

  function local(ev: React.PointerEvent): Ponto {
    const r = ev.currentTarget.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function aoDescer(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const p = local(ev);
    ponteiros.current.set(ev.pointerId, p);
    if (ponteiros.current.size === 1) gesto.current = { inicio: p, moveu: false };
    else gesto.current.moveu = true;
  }

  function aoMover(ev: React.PointerEvent<HTMLCanvasElement>) {
    const antes = ponteiros.current.get(ev.pointerId);
    if (!antes) return;
    const p = local(ev);
    if (ponteiros.current.size === 1) {
      const { inicio } = gesto.current;
      if (Math.hypot(p.x - inicio.x, p.y - inicio.y) > ARRASTE_MINIMO) gesto.current.moveu = true;
      if (!gesto.current.moveu) return;
      const v = vistaRef.current;
      autoRef.current = false;
      vistaRef.current = { ...v, tx: v.tx + p.x - antes.x, ty: v.ty + p.y - antes.y };
      ponteiros.current.set(ev.pointerId, p);
      redesenhar();
      return;
    }
    const outros = [...ponteiros.current.entries()].filter(([id]) => id !== ev.pointerId);
    if (outros.length !== 1) {
      ponteiros.current.set(ev.pointerId, p);
      return;
    }
    const o = outros[0][1];
    const distAntes = Math.hypot(antes.x - o.x, antes.y - o.y);
    const distAgora = Math.hypot(p.x - o.x, p.y - o.y);
    ponteiros.current.set(ev.pointerId, p);
    if (distAntes > 0) zoomEm(distAgora / distAntes, { x: (p.x + o.x) / 2, y: (p.y + o.y) / 2 });
  }

  function aoSubir(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (!ponteiros.current.has(ev.pointerId)) return;
    const eraUnico = ponteiros.current.size === 1;
    ponteiros.current.delete(ev.pointerId);
    if (ev.type !== "pointerup" || !eraUnico || gesto.current.moveu) return;
    const quando = atual.current.onPontoMundo;
    if (quando) quando(aplicar(inverter(vistaRef.current), local(ev)));
  }

  useImperativeHandle(
    ref,
    () => ({
      ajustar,
      paraImagem(centroMundo, larguraPx, alturaPx) {
        const fora = document.createElement("canvas");
        fora.width = Math.max(1, Math.round(larguraPx));
        fora.height = Math.max(1, Math.round(alturaPx));
        const ctx = fora.getContext("2d");
        if (!ctx) return Promise.reject(new Error("Canvas 2D indisponível."));
        const escala = vistaRef.current.escala;
        const vista: VistaPalco = {
          tx: fora.width / 2 - escala * centroMundo.x,
          ty: fora.height / 2 - escala * centroMundo.y,
          giro: 0,
          escala,
        };
        desenharCena(ctx, 1, vista, atual.current.camadas, atual.current.sobreposto);
        // O papel do palco vem do CSS; a imagem leva o mesmo fundo por baixo das camadas.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = canvasRef.current ? getComputedStyle(canvasRef.current).backgroundColor : "white";
        ctx.fillRect(0, 0, fora.width, fora.height);
        return new Promise<Blob>((resolve, reject) =>
          fora.toBlob((b) => (b ? resolve(b) : reject(new Error("Não foi possível gerar a imagem."))), "image/png"),
        );
      },
    }),
    [ajustar],
  );

  return (
    <canvas
      ref={canvasRef}
      className={cn("block size-full touch-none select-none bg-white", className)}
      onPointerDown={aoDescer}
      onPointerMove={aoMover}
      onPointerUp={aoSubir}
      onPointerCancel={aoSubir}
      onDoubleClick={ajustar}
      aria-label="Sobreposição das plantas. Role para aproximar, arraste para mover, duplo clique para ajustar à tela."
      role="img"
    />
  );
});
