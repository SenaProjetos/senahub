"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Projecao } from "@/modules/financeiro/liquidez/motor";
import type { DataIso, EventoCaixa } from "@/modules/financeiro/liquidez/tipos";
import { brlC, brlCSinal, marcasDoEixo, rotuloCompacto, rotuloDia } from "@/components/financeiro/planejador/formato";
import { diaMes } from "@/modules/financeiro/liquidez/datas";
import { cn } from "@/lib/utils";

/**
 * Linha do tempo do caixa (mockup "Planejador"): saldo nas contas (navy, contínuo), dinheiro livre
 * (ocre, tracejado; abaixo de zero = reserva descoberta), reserva mínima (referência cinza com
 * hachura abaixo) e, quando há ajustes, o "antes" em cinza. As barras de baixo são entradas (acima)
 * e saídas (abaixo) de cada dia; transferência não entra nelas.
 *
 * Acessível sem mouse: o gráfico recebe foco (Tab) e as setas percorrem os dias; o dia atual é
 * anunciado. A agenda logo abaixo traz os mesmos números em texto.
 */

const COR_SALDO = "var(--chart-1)";
const COR_LIVRE = "var(--chart-4)";

type Props = {
  projecao: Projecao;
  antes: Projecao | null;
  eventos: readonly EventoCaixa[];
  caixaAtual: number;
  reservaMinima: number;
};

export function LinhaDoTempo({ projecao, antes, eventos, caixaAtual, reservaMinima }: Props) {
  const serie = projecao.serie;
  const n = serie.length;
  const [cursor, setCursor] = useState<number | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const idLegenda = useId();

  const geo = useMemo(() => {
    const valores = [caixaAtual, reservaMinima, 0, ...serie.flatMap((d) => [d.saldo, d.livreBruto]), ...(antes?.serie.map((d) => d.saldo) ?? [])];
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const folga = Math.max(1, (max - min) * 0.08);
    const yMin = min < 0 ? min - folga : 0;
    // O topo vai até a próxima marca redonda: sem isso a linha do saldo fica acima da última
    // marca do eixo, sem valor de referência.
    const provisorias = marcasDoEixo(yMin, max + folga);
    const passo = provisorias.length > 1 ? provisorias[1] - provisorias[0] : 0;
    const topo = provisorias[provisorias.length - 1];
    const yMax = passo > 0 && topo < max + folga ? topo + passo : max + folga;
    const Y = (v: number) => ((yMax - v) / (yMax - yMin)) * 100;
    const X = (i: number) => (i / n) * 1000;
    const caminho = (valoresDia: number[]) => {
      let p = `M 0 ${Y(caixaAtual).toFixed(2)}`;
      valoresDia.forEach((v, i) => {
        p += ` H ${X(i).toFixed(1)} V ${Y(v).toFixed(2)}`;
      });
      return `${p} H 1000`;
    };
    let fluxoMax = 1;
    for (const d of serie) fluxoMax = Math.max(fluxoMax, d.entradas, d.saidas);
    return {
      Y,
      yMin,
      // A reserva tem rótulo próprio; sem reserva definida (0) a marca do zero fica.
      marcas: marcasDoEixo(yMin, yMax).filter((m) => reservaMinima <= 0 || m !== reservaMinima),
      saldo: caminho(serie.map((d) => d.saldo)),
      livre: caminho(serie.map((d) => d.livreBruto)),
      antes: antes ? caminho(antes.serie.map((d) => d.saldo)) : null,
      fluxoMax,
    };
  }, [serie, antes, caixaAtual, reservaMinima, n]);

  const eventosDoDia = useMemo(() => {
    const mapa = new Map<DataIso, { descricao: string; valor: number }[]>();
    const porId = new Map(eventos.map((e) => [e.id, e]));
    for (const p of projecao.eventos) {
      if (!p.aplicado || !p.dia) continue;
      const e = porId.get(p.id);
      if (!e) continue;
      const lista = mapa.get(p.dia) ?? [];
      lista.push({ descricao: e.descricao, valor: e.tipo === "receita" ? e.valor : -e.valor });
      mapa.set(p.dia, lista);
    }
    return mapa;
  }, [projecao.eventos, eventos]);

  const marcasX = useMemo(() => {
    const idx = [0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round((3 * (n - 1)) / 4), n - 1];
    return [...new Set(idx)].map((i) => ({ i, rotulo: diaMes(serie[i].dia) }));
  }, [n, serie]);

  const minIdx = serie.findIndex((d) => d.dia === projecao.menorSaldo.dia);
  const final = serie[n - 1];

  function moverPara(clientX: number) {
    const r = area.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    setCursor(Math.min(n - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * n))));
  }

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const atual = cursor ?? 0;
    const passo = e.shiftKey ? 7 : 1;
    let proximo: number | null = null;
    if (e.key === "ArrowRight") proximo = Math.min(n - 1, atual + passo);
    else if (e.key === "ArrowLeft") proximo = Math.max(0, atual - passo);
    else if (e.key === "Home") proximo = 0;
    else if (e.key === "End") proximo = n - 1;
    else if (e.key === "Escape") return setCursor(null);
    if (proximo !== null) {
      e.preventDefault();
      setCursor(proximo);
    }
  }

  const diaCursor = cursor !== null ? serie[cursor] : null;
  const anuncio = diaCursor
    ? `${rotuloDia(diaCursor.dia)}: saldo ${brlC(diaCursor.saldo)}, livre ${brlC(diaCursor.livreBruto)}${
        (eventosDoDia.get(diaCursor.dia) ?? []).length ? `, ${(eventosDoDia.get(diaCursor.dia) ?? []).length} movimentos` : ""
      }`
    : "";

  return (
    // `relative`: o `sr-only` do anúncio é absoluto e, sem ancestral posicionado, escaparia da rolagem.
    <figure className="relative m-0 space-y-2">
      <div id={idLegenda} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <span className="flex items-center gap-1.5">
          <i aria-hidden className="inline-block h-0.5 w-5" style={{ background: COR_SALDO }} /> Saldo nas contas
        </span>
        <span className="flex flex-wrap items-center gap-x-1.5">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <i aria-hidden className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: COR_LIVRE }} /> Dinheiro livre
          </span>
          <span className="text-muted-foreground">(abaixo de zero: reserva descoberta)</span>
        </span>
        {reservaMinima > 0 && (
          <span className="flex items-center gap-1.5">
            <i aria-hidden className="inline-block w-5 border-t-2 border-dashed border-muted-foreground" /> Reserva mínima
          </span>
        )}
        {antes && (
          <span className="flex items-center gap-1.5">
            <i aria-hidden className="inline-block h-0.5 w-5 bg-muted-foreground/50" /> Antes dos ajustes
          </span>
        )}
      </div>

      <div className="relative ml-12 mr-2 h-64 sm:h-72 lg:mr-28">
        {geo.marcas.map((m) => (
          <div key={m} aria-hidden>
            <div className="absolute inset-x-0 border-t border-border/60" style={{ top: `${geo.Y(m)}%` }} />
            <span className="absolute -left-12 -translate-y-1/2 font-mono text-[11px] text-muted-foreground" style={{ top: `${geo.Y(m)}%` }}>
              {rotuloCompacto(m)}
            </span>
          </div>
        ))}
        {reservaMinima > 0 && (
          <div aria-hidden>
            <div
              className="absolute inset-x-0 bottom-0"
              style={{
                top: `${geo.Y(reservaMinima)}%`,
                background: "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in oklab, var(--destructive) 12%, transparent) 6px 8px)",
              }}
            />
            <div className="absolute inset-x-0 border-t-2 border-dashed border-muted-foreground" style={{ top: `${geo.Y(reservaMinima)}%` }} />
            <span className="absolute left-2 mt-1 text-xs font-semibold text-muted-foreground" style={{ top: `${geo.Y(reservaMinima)}%` }}>
              Reserva mínima {brlC(reservaMinima)}
            </span>
          </div>
        )}
        {geo.yMin < 0 && (
          <div aria-hidden>
            <div className="absolute inset-x-0 border-t-2 border-destructive" style={{ top: `${geo.Y(0)}%` }} />
            <span className="absolute left-2 mt-1 text-xs font-bold text-destructive" style={{ top: `${geo.Y(0)}%` }}>
              Zero: déficit abaixo desta linha
            </span>
          </div>
        )}

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          {geo.antes && <path d={geo.antes} fill="none" stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
          <path d={geo.livre} fill="none" stroke={COR_LIVRE} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          <path d={geo.saldo} fill="none" stroke={COR_SALDO} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        </svg>

        {minIdx >= 0 && (
          <div aria-hidden>
            <span
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] bg-card"
              style={{ left: `${((minIdx + 0.5) / n) * 100}%`, top: `${geo.Y(projecao.menorSaldo.valor)}%`, borderColor: COR_SALDO }}
            />
            <span
              className="absolute mt-2 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] font-semibold"
              style={{ left: `${Math.min(88, Math.max(8, ((minIdx + 0.5) / n) * 100))}%`, top: `${geo.Y(projecao.menorSaldo.valor)}%` }}
            >
              menor: {brlC(projecao.menorSaldo.valor)}
            </span>
          </div>
        )}

        <span aria-hidden className="absolute left-full hidden -translate-y-1/2 whitespace-nowrap pl-2 font-mono text-xs font-semibold lg:block" style={{ top: `${geo.Y(final.saldo)}%` }}>
          Saldo {rotuloCompacto(final.saldo)}
        </span>
        {Math.abs(geo.Y(final.saldo) - geo.Y(final.livreBruto)) > 6 && (
          <span aria-hidden className="absolute left-full hidden -translate-y-1/2 whitespace-nowrap pl-2 font-mono text-xs lg:block" style={{ top: `${geo.Y(final.livreBruto)}%` }}>
            Livre {rotuloCompacto(final.livreBruto)}
          </span>
        )}

        {/* Camada de interação: foco por Tab, setas percorrem os dias (Shift = uma semana). */}
        <div
          ref={area}
          tabIndex={0}
          role="group"
          aria-roledescription="gráfico"
          aria-label="Linha do tempo do caixa. Use as setas para percorrer os dias; Shift com seta pula uma semana."
          aria-describedby={idLegenda}
          className="absolute inset-0 cursor-crosshair rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerMove={(e: PointerEvent<HTMLDivElement>) => moverPara(e.clientX)}
          onPointerLeave={() => setCursor(null)}
          onKeyDown={aoTeclar}
          onFocus={() => setCursor((c) => c ?? 0)}
          onBlur={() => setCursor(null)}
        />

        {diaCursor && cursor !== null && (
          <>
            <div aria-hidden className="pointer-events-none absolute inset-y-0 border-l border-muted-foreground" style={{ left: `${((cursor + 0.5) / n) * 100}%` }} />
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-1.5 z-10 min-w-56 rounded-sm border bg-popover px-3 py-2 text-[12.5px] shadow-md",
                cursor > n * 0.6 ? "-translate-x-[calc(100%+8px)]" : "translate-x-2",
              )}
              style={{ left: `${((cursor + 0.5) / n) * 100}%` }}
            >
              <p className="mb-1 font-semibold">{rotuloDia(diaCursor.dia)}</p>
              <p className="flex justify-between gap-4">
                <span>Saldo nas contas</span>
                <span className="font-mono">{brlC(diaCursor.saldo)}</span>
              </p>
              <p className="flex justify-between gap-4">
                <span>Dinheiro livre</span>
                <span className="font-mono">{brlC(diaCursor.livreBruto)}</span>
              </p>
              {(eventosDoDia.get(diaCursor.dia) ?? []).slice(0, 5).map((ev, k) => (
                <p key={k} className="flex justify-between gap-4 text-muted-foreground">
                  <span className="max-w-40 truncate">{ev.descricao}</span>
                  <span className="font-mono">{brlCSinal(ev.valor)}</span>
                </p>
              ))}
            </div>
          </>
        )}
      </div>

      <div aria-hidden className="ml-12 mr-2 flex h-14 border-t border-border lg:mr-28">
        {serie.map((d) => (
          <div key={d.dia} className="flex flex-1 flex-col px-px">
            <div className="flex flex-1 items-end justify-center">
              <span className="w-3/5 max-w-3 bg-success" style={{ height: `${(d.entradas / geo.fluxoMax) * 100}%` }} />
            </div>
            <div className="flex flex-1 items-start justify-center border-t border-border">
              <span className="w-3/5 max-w-3 bg-destructive" style={{ height: `${(d.saidas / geo.fluxoMax) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div aria-hidden className="relative ml-12 mr-2 h-4 font-mono text-[11px] text-muted-foreground lg:mr-28">
        {marcasX.map(({ i, rotulo }) => (
          <span
            key={i}
            className={cn("absolute", i === 0 ? "" : i === n - 1 ? "-translate-x-full" : "-translate-x-1/2")}
            style={{ left: `${(i / Math.max(1, n - 1)) * 100}%` }}
          >
            {rotulo}
          </span>
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>
      <figcaption className="text-[12.5px] text-muted-foreground">
        Barras abaixo do gráfico: entradas (acima da linha) e saídas (abaixo) de cada dia. Faixa hachurada: abaixo da reserva
        mínima. A agenda traz os mesmos números em texto.
      </figcaption>
    </figure>
  );
}
