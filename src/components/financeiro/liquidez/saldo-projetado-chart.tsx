"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import type { GraficoDaTorre } from "@/modules/financeiro/liquidez/torre";
import { brlC, marcasDoEixo, rotuloCompacto, rotuloDia } from "@/components/financeiro/planejador/formato";
import { cn } from "@/lib/utils";

/**
 * Saldo projetado da Visão geral (mock "Financeiro — Visão geral"): a linha cheia é o cenário
 * Provável e a tracejada o Conservador, com a reserva mínima como referência e hachura abaixo dela.
 *
 * A identidade das duas linhas nunca é só a cor: a legenda está sempre à vista, as duas pontas são
 * rotuladas no fim do gráfico e os mesmos números existem em texto (o `aria-label` de cada dia e o
 * link para o fluxo diário). Com o teclado, Tab entra no gráfico e as setas percorrem os dias.
 */

const COR_PROVAVEL = "var(--chart-1)";
const COR_CONSERVADOR = "var(--chart-4)";

export function SaldoProjetadoChart({ grafico, hrefTabela = "/financeiro/fluxo-caixa" }: { grafico: GraficoDaTorre; hrefTabela?: string }) {
  const { dias, provavel, conservador, reservaMinima } = grafico;
  const n = dias.length;
  const [cursor, setCursor] = useState<number | null>(null);
  const idLegenda = useId();

  const geo = useMemo(() => {
    const valores = [...provavel, ...conservador, reservaMinima, 0];
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const folga = Math.max(1, (max - min) * 0.08);
    const yMin = min < 0 ? min - folga : 0;
    const marcas = marcasDoEixo(yMin, max + folga);
    const passo = marcas.length > 1 ? marcas[1] - marcas[0] : 0;
    const topo = marcas[marcas.length - 1];
    const yMax = passo > 0 && topo < max + folga ? topo + passo : max + folga;
    const Y = (v: number) => ((yMax - v) / (yMax - yMin)) * 100;
    const X = (i: number) => (i / n) * 1000;
    // Degrau: o saldo só muda no fecho do dia, então a linha anda reta e desce de uma vez.
    const caminho = (serie: readonly number[]) => {
      let p = `M 0 ${Y(serie[0] ?? 0).toFixed(2)}`;
      serie.forEach((v, i) => {
        p += ` H ${X(i).toFixed(1)} V ${Y(v).toFixed(2)}`;
      });
      return `${p} H 1000`;
    };
    return { Y, X, yMin, yMax, marcas, caminho };
  }, [provavel, conservador, reservaMinima, n]);

  const fimProvavel = provavel.at(-1) ?? 0;
  const fimConservador = conservador.at(-1) ?? 0;
  const dia = cursor == null ? null : { data: dias[cursor], prov: provavel[cursor], cons: conservador[cursor] };

  function aoTeclado(e: KeyboardEvent<HTMLDivElement>) {
    const atual = cursor ?? 0;
    const passo = e.shiftKey ? 7 : 1;
    if (e.key === "ArrowRight") setCursor(Math.min(n - 1, atual + passo));
    else if (e.key === "ArrowLeft") setCursor(Math.max(0, atual - passo));
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
          <i aria-hidden className="inline-block h-[2px] w-4" style={{ background: COR_PROVAVEL }} />
          Provável
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: COR_CONSERVADOR }} />
          Conservador
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <i aria-hidden className="inline-block w-4 border-t-2 border-dashed border-muted-foreground" />
          Reserva mínima {brlC(reservaMinima)}
        </span>
      </div>

      <div
        tabIndex={0}
        role="group"
        aria-labelledby={idLegenda}
        aria-describedby={`${idLegenda}-ajuda`}
        onKeyDown={aoTeclado}
        onBlur={() => setCursor(null)}
        className="relative h-[220px] rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:h-[260px]"
        style={{ marginLeft: 48, marginRight: 8 }}
      >
        {geo.marcas.map((m) => (
          <div key={m} className="pointer-events-none absolute inset-x-0" style={{ top: `${geo.Y(m)}%` }}>
            <div className="border-t border-border/60" />
            <span className="absolute -left-12 -translate-y-1/2 font-mono text-[11.5px] text-muted-foreground">{rotuloCompacto(m)}</span>
          </div>
        ))}

        {/* Hachura abaixo da reserva: a faixa que não deve ser alcançada. */}
        {reservaMinima > geo.yMin && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 opacity-70"
              style={{
                top: `${geo.Y(reservaMinima)}%`,
                background: "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--muted-foreground) 14%, transparent) 6px 8px)",
              }}
            />
            <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-muted-foreground" style={{ top: `${geo.Y(reservaMinima)}%` }} />
          </>
        )}

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <path d={geo.caminho(conservador)} fill="none" stroke={COR_CONSERVADOR} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          <path d={geo.caminho(provavel)} fill="none" stroke={COR_PROVAVEL} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>

        {/* Dias focáveis: o mesmo número em texto para quem não usa o mouse. */}
        <div className="absolute inset-0 flex">
          {dias.map((d, i) => (
            <button
              key={d}
              type="button"
              tabIndex={-1}
              aria-label={`${rotuloDia(d)}: Provável ${brlC(provavel[i])}, Conservador ${brlC(conservador[i])}`}
              onMouseEnter={() => setCursor(i)}
              onFocus={() => setCursor(i)}
              onMouseLeave={() => setCursor(null)}
              className="flex-1 cursor-crosshair border-0 bg-transparent p-0"
            />
          ))}
        </div>

        {dia && (
          <>
            <div className="pointer-events-none absolute inset-y-0 border-l border-muted-foreground" style={{ left: `${(((cursor ?? 0) + 0.5) / n) * 100}%` }} />
            <div
              className="pointer-events-none absolute top-2 z-10 rounded-sm border bg-popover px-2.5 py-2 text-[12.5px] whitespace-nowrap shadow-sm"
              style={{
                left: `${(((cursor ?? 0) + 0.5) / n) * 100}%`,
                transform: (cursor ?? 0) > n * 0.7 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
              }}
            >
              <div className="mb-1 font-bold">{rotuloDia(dia.data)}</div>
              <div className="flex items-center justify-between gap-4">
                <span>Provável</span>
                <span className="font-mono">{brlC(dia.prov)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Conservador</span>
                <span className="font-mono">{brlC(dia.cons)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-between font-mono text-[11.5px] text-muted-foreground" style={{ marginLeft: 48, marginRight: 8 }}>
        <span>{rotuloDia(dias[0] ?? "")}</span>
        <span>{rotuloDia(dias.at(-1) ?? "")}</span>
      </div>

      <figcaption className="text-[12.5px] text-muted-foreground" id={`${idLegenda}-ajuda`}>
        No fim do período: Provável <span className={cn("font-mono", fimProvavel < reservaMinima && "text-destructive")}>{brlC(fimProvavel)}</span>, Conservador{" "}
        <span className={cn("font-mono", fimConservador < reservaMinima && "text-destructive")}>{brlC(fimConservador)}</span>. A previsão do cronograma não entra nas duas
        linhas. Passe o cursor ou use as setas nos dias. <Link href={hrefTabela} className="font-semibold underline-offset-2 hover:underline">Ver dia a dia</Link>
      </figcaption>
    </figure>
  );
}
