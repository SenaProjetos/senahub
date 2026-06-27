/**
 * Primitivas SVG reutilizáveis para os desenhos esquemáticos (didáticos) do
 * guia de entrada. Puras/sem estado — usam classes de tema (fill- / stroke-),
 * portanto funcionam em claro e escuro. Coordenadas em espaço de tela (Y p/ baixo).
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const SANS = "ui-sans-serif, system-ui, sans-serif";

/** Moldura + <svg> com defs comuns (cabeça de seta). */
export function Schematic({
  viewBox,
  children,
  className,
}: {
  viewBox: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className="rounded-lg border bg-gradient-to-b from-muted/40 to-background p-3 dark:from-zinc-900/60 dark:to-zinc-900/10">
      <svg
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        className={cn("mx-auto h-auto w-full max-h-[360px]", className)}
      >
        <defs>
          <marker
            id="gf-arrow"
            viewBox="0 0 10 10"
            refX="8.5"
            refY="5"
            markerWidth="6.5"
            markerHeight="6.5"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
        </defs>
        {children}
      </svg>
    </figure>
  );
}

/** Linha de cota (com setas nas duas pontas) e rótulo centralizado. */
export function Dim({
  x1,
  y1,
  x2,
  y2,
  label,
  className,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  className?: string;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
  return (
    <g className={cn("stroke-muted-foreground", className)} strokeWidth={1}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} markerStart="url(#gf-arrow)" markerEnd="url(#gf-arrow)" />
      <text
        x={mx}
        y={my}
        dy={horizontal ? -5 : 0}
        dx={horizontal ? 0 : -6}
        textAnchor={horizontal ? "middle" : "end"}
        dominantBaseline={horizontal ? "auto" : "middle"}
        className="fill-muted-foreground stroke-none"
        fontSize={12.5}
        fontFamily={SANS}
        fontStyle="italic"
      >
        {label}
      </text>
    </g>
  );
}

/** Carga distribuída: linha superior + setas para baixo. */
export function LoadArrows({
  x1,
  x2,
  y,
  depth = 26,
  n = 9,
  className,
}: {
  x1: number;
  x2: number;
  y: number;
  depth?: number;
  n?: number;
  className?: string;
}) {
  const xs = Array.from({ length: n }, (_, i) => x1 + ((x2 - x1) * i) / (n - 1));
  return (
    <g className={cn("stroke-primary", className)} strokeWidth={1.3}>
      <line x1={x1} y1={y} x2={x2} y2={y} />
      {xs.map((x, i) => (
        <line key={i} x1={x} y1={y} x2={x} y2={y + depth} markerEnd="url(#gf-arrow)" />
      ))}
    </g>
  );
}

/** Apoio fixo (2º gênero): triângulo + base hachurada. */
export function SupportPin({ x, y, size = 20 }: { x: number; y: number; size?: number }) {
  const h = size * 0.95;
  const base = y + h;
  return (
    <g className="fill-muted stroke-foreground/70" strokeWidth={1}>
      <path d={`M ${x} ${y} L ${x - size / 2} ${base} L ${x + size / 2} ${base} Z`} />
      <line x1={x - size / 2 - 5} y1={base} x2={x + size / 2 + 5} y2={base} />
      {[-1, 0, 1].map((k) => (
        <line key={k} x1={x + k * 6 - 4} y1={base + 6} x2={x + k * 6} y2={base} />
      ))}
    </g>
  );
}

/** Apoio móvel (1º gênero): triângulo + rolete. */
export function SupportRoller({ x, y, size = 20 }: { x: number; y: number; size?: number }) {
  const h = size * 0.7;
  const base = y + h;
  return (
    <g className="fill-muted stroke-foreground/70" strokeWidth={1}>
      <path d={`M ${x} ${y} L ${x - size / 2} ${base} L ${x + size / 2} ${base} Z`} />
      <circle cx={x - size * 0.26} cy={base + 4} r={3.2} />
      <circle cx={x + size * 0.26} cy={base + 4} r={3.2} />
      <line x1={x - size / 2 - 5} y1={base + 8} x2={x + size / 2 + 5} y2={base + 8} />
    </g>
  );
}

/** Badge circular numerado (liga o desenho à legenda). */
export function Anchor({ x, y, n }: { x: number; y: number; n: number | string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={11} className="fill-primary stroke-background" strokeWidth={1.5} />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-primary-foreground"
        fontSize={12}
        fontWeight={700}
        fontFamily={SANS}
      >
        {n}
      </text>
    </g>
  );
}

/** Linha tracejada de chamada (badge → ponto do desenho). */
export function Connector({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      className="stroke-primary/45"
      strokeWidth={1}
      strokeDasharray="4 3"
    />
  );
}

/** Rótulo de texto temático (sans). Use italic p/ símbolos (b, h, d…). */
export function Tag({
  x,
  y,
  children,
  anchor = "middle",
  italic = false,
  muted = false,
  size = 13,
}: {
  x: number;
  y: number;
  children: ReactNode;
  anchor?: "start" | "middle" | "end";
  italic?: boolean;
  muted?: boolean;
  size?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="middle"
      className={muted ? "fill-muted-foreground" : "fill-foreground"}
      fontSize={size}
      fontStyle={italic ? "italic" : undefined}
      fontFamily={SANS}
    >
      {children}
    </text>
  );
}
