"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type { LinhaDiaria } from "@/modules/financeiro/caixa/diario";
import { brlC, brlCSinal, marcasDoEixo, rotuloCompacto, rotuloDia } from "@/components/financeiro/planejador/formato";

/**
 * Fluxo de caixa dia a dia (mock "Fluxo de caixa"): em cima o saldo acumulado — linha cheia no
 * realizado, tracejada depois de hoje —, embaixo as barras do que entrou (acima do eixo) e do que
 * saiu (abaixo). As barras previstas ficam mais claras, para o olho não confundir o que aconteceu
 * com o que está marcado para acontecer.
 *
 * Os mesmos números estão na tabela logo abaixo; aqui cada dia é focável e anuncia o valor, então a
 * leitura nunca depende da cor nem do traço.
 */

const COR_SALDO = "var(--chart-1)";

export function FluxoDiarioChart({ serie, reservaMinima, hoje }: { serie: readonly LinhaDiaria[]; reservaMinima: number; hoje: string }) {
  const n = serie.length;
  const [cursor, setCursor] = useState<number | null>(null);
  const idLegenda = useId();

  const geo = useMemo(() => {
    const saldos = serie.map((l) => l.acumulado);
    const min = Math.min(...saldos, reservaMinima, 0);
    const max = Math.max(...saldos, reservaMinima);
    const folga = Math.max(1, (max - min) * 0.08);
    const yMin = min < 0 ? min - folga : 0;
    const marcas = marcasDoEixo(yMin, max + folga);
    const passo = marcas.length > 1 ? marcas[1] - marcas[0] : 0;
    const topo = marcas[marcas.length - 1];
    const yMax = passo > 0 && topo < max + folga ? topo + passo : max + folga;
    const Y = (v: number) => ((yMax - v) / (yMax - yMin)) * 100;
    const X = (i: number) => (i / n) * 1000;
    const caminho = (indices: number[]) => {
      if (indices.length === 0) return "";
      let p = `M ${X(indices[0]).toFixed(1)} ${Y(serie[indices[0]].acumulado).toFixed(2)}`;
      for (const i of indices) p += ` H ${X(i + 1).toFixed(1)} V ${Y(serie[i].acumulado).toFixed(2)}`;
      return p;
    };
    const maiorBarra = Math.max(1, ...serie.map((l) => Math.max(l.entradas, l.saidas)));
    return { Y, X, marcas, caminho, maiorBarra };
  }, [serie, reservaMinima, n]);

  const indicesRealizado = serie.map((l, i) => (l.tipo === "realizado" ? i : -1)).filter((i) => i >= 0);
  const indicesPrevisto = serie.map((l, i) => (l.tipo === "previsto" ? i : -1)).filter((i) => i >= 0);
  const iHoje = serie.findIndex((l) => l.dia >= hoje);
  const atual = cursor == null ? null : serie[cursor];

  function aoTeclado(e: KeyboardEvent<HTMLDivElement>) {
    const i = cursor ?? Math.max(0, iHoje);
    const passo = e.shiftKey ? 7 : 1;
    if (e.key === "ArrowRight") setCursor(Math.min(n - 1, i + passo));
    else if (e.key === "ArrowLeft") setCursor(Math.max(0, i - passo));
    else if (e.key === "Home") setCursor(0);
    else if (e.key === "End") setCursor(n - 1);
    else if (e.key === "Escape") setCursor(null);
    else return;
    e.preventDefault();
  }

  return (
    <figure className="m-0 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]" id={idLegenda}>
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="inline-block h-[2px] w-4" style={{ background: COR_SALDO }} /> Saldo realizado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: COR_SALDO }} /> Saldo previsto
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="inline-block size-2.5 bg-success" /> Entrou
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="inline-block size-2.5 bg-destructive" /> Saiu
        </span>
      </div>

      <div
        tabIndex={0}
        role="group"
        aria-labelledby={idLegenda}
        onKeyDown={aoTeclado}
        onBlur={() => setCursor(null)}
        className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="relative h-[190px] sm:h-[220px]" style={{ marginLeft: 52, marginRight: 8 }}>
          {geo.marcas.map((m) => (
            <div key={m} className="pointer-events-none absolute inset-x-0" style={{ top: `${geo.Y(m)}%` }}>
              <div className="border-t border-border/60" />
              <span className="absolute -left-[52px] -translate-y-1/2 font-mono text-[11.5px] text-muted-foreground">{rotuloCompacto(m)}</span>
            </div>
          ))}
          <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-muted-foreground" style={{ top: `${geo.Y(reservaMinima)}%` }} />
          <span className="pointer-events-none absolute left-2 text-[12px] font-semibold text-muted-foreground" style={{ top: `calc(${geo.Y(reservaMinima)}% + 4px)` }}>
            Reserva mínima
          </span>
          {iHoje >= 0 && (
            <>
              <div className="pointer-events-none absolute inset-y-0 border-l border-foreground" style={{ left: `${(iHoje / n) * 100}%` }} />
              <span className="pointer-events-none absolute -top-1 text-[12px] font-bold" style={{ left: `calc(${(iHoje / n) * 100}% + 4px)` }}>
                Hoje
              </span>
            </>
          )}
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
            <path d={geo.caminho(indicesRealizado)} fill="none" stroke={COR_SALDO} strokeWidth={2.25} vectorEffect="non-scaling-stroke" />
            <path d={geo.caminho(indicesPrevisto)} fill="none" stroke={COR_SALDO} strokeWidth={2.25} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="absolute inset-0 flex">
            {serie.map((l, i) => (
              <button
                key={l.dia}
                type="button"
                tabIndex={-1}
                aria-label={`${rotuloDia(l.dia)} (${l.tipo}): entradas ${brlC(l.entradas)}, saídas ${brlC(l.saidas)}, saldo acumulado ${brlC(l.acumulado)}`}
                onMouseEnter={() => setCursor(i)}
                onFocus={() => setCursor(i)}
                onMouseLeave={() => setCursor(null)}
                className="flex-1 cursor-crosshair border-0 bg-transparent p-0"
              />
            ))}
          </div>
          {atual && (
            <div
              className="pointer-events-none absolute top-1 z-10 rounded-sm border bg-popover px-2.5 py-2 text-[12.5px] whitespace-nowrap shadow-sm"
              style={{
                left: `${(((cursor ?? 0) + 0.5) / n) * 100}%`,
                transform: (cursor ?? 0) > n * 0.7 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
              }}
            >
              <div className="mb-1 font-bold">
                {rotuloDia(atual.dia)} · {atual.tipo}
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Entrou</span>
                <span className="font-mono">{brlCSinal(atual.entradas)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Saiu</span>
                <span className="font-mono">{brlCSinal(-atual.saidas)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 font-semibold">
                <span>Saldo</span>
                <span className="font-mono">{brlC(atual.acumulado)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Barras: entrou acima do eixo, saiu abaixo. */}
        <div aria-hidden className="relative mt-4 h-[76px]" style={{ marginLeft: 52, marginRight: 8 }}>
          <div className="absolute inset-x-0 top-1/2 border-t border-border" />
          <div className="absolute inset-0 flex">
            {serie.map((l) => (
              <div key={l.dia} className="flex flex-1 flex-col px-px" style={{ opacity: l.tipo === "previsto" ? 0.45 : 1 }}>
                <div className="flex flex-1 items-end justify-center">
                  <span className="w-[70%] bg-success" style={{ height: `${(l.entradas / geo.maiorBarra) * 100}%` }} />
                </div>
                <div className="flex flex-1 items-start justify-center">
                  <span className="w-[70%] bg-destructive" style={{ height: `${(l.saidas / geo.maiorBarra) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <span className="absolute -left-[52px] top-[18%] text-[11.5px] text-muted-foreground">entrou</span>
          <span className="absolute -left-[52px] top-[62%] text-[11.5px] text-muted-foreground">saiu</span>
        </div>
      </div>

      <div className="flex justify-between font-mono text-[11.5px] text-muted-foreground" style={{ marginLeft: 52, marginRight: 8 }}>
        <span>{rotuloDia(serie[0]?.dia ?? "")}</span>
        <span>{rotuloDia(serie.at(-1)?.dia ?? "")}</span>
      </div>

      <figcaption className="text-[12.5px] text-muted-foreground">
        Antes de hoje: realizado (baixa e conciliação). De hoje em diante: previsto pelo cenário escolhido, com as barras mais claras. A tabela abaixo traz os mesmos
        números.
      </figcaption>
    </figure>
  );
}
