"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Valor } from "@/components/financeiro/valor";
import { brlC } from "@/components/financeiro/planejador/formato";
import { diaMes } from "@/modules/financeiro/liquidez/datas";
import type { ResumoCenario } from "@/modules/financeiro/planejador/cenarios/resumo";
import { cn } from "@/lib/utils";

export type ItemComparacao = { id: string; nome: string; resumo: ResumoCenario };

/**
 * Comparação lado a lado (mock "Cenários salvos"): a MESMA escala vertical em todos os gráficos —
 * senão a diferença entre cenários some —, reserva mínima tracejada com hachura abaixo, e os três
 * números que decidem (saldo no fim, menor saldo, margem até a reserva) em texto.
 */
export function ComparacaoCenarios({
  itens,
  caixaAtual,
  reservaMinima,
  onFechar,
}: {
  itens: ItemComparacao[];
  caixaAtual: number;
  reservaMinima: number;
  onFechar: () => void;
}) {
  const valores = [0, caixaAtual, reservaMinima, ...itens.flatMap((i) => i.resumo.serie)];
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const folga = Math.max(1, (max - min) * 0.08);
  const yMin = min < 0 ? min - folga : 0;
  const yMax = max + folga;
  const Y = (v: number) => ((yMax - v) / (yMax - yMin)) * 100;

  const caminho = (serie: number[]) => {
    const n = serie.length || 1;
    let p = `M 0 ${Y(caixaAtual).toFixed(2)}`;
    serie.forEach((v, i) => {
      p += ` H ${((i / n) * 1000).toFixed(1)} V ${Y(v).toFixed(2)}`;
    });
    return `${p} H 1000`;
  };

  return (
    <section aria-labelledby="cmp-t" className="rounded-sm border bg-card shadow-[var(--card-shadow)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3">
        <h2 id="cmp-t" className="text-[15px] font-bold">
          Comparação: {itens.length === 1 ? "situação atual" : `situação atual e ${itens.length - 1} ${itens.length === 2 ? "cenário" : "cenários"}`}
        </h2>
        <span className="text-[13px] text-muted-foreground">Mesma escala nos gráficos. Linha tracejada: reserva mínima.</span>
        <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="Fechar comparação" onClick={onFechar}>
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="grid gap-5 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        {itens.map((i) => {
          const r = i.resumo;
          const margem = r.menorSaldo - reservaMinima;
          const tom = r.situacao === "deficit" ? "text-destructive" : r.situacao === "reserva" ? "text-warning" : "";
          return (
            <figure key={i.id} className="m-0 flex min-w-0 flex-col gap-2">
              <figcaption className="truncate text-sm font-bold">{i.nome}</figcaption>
              <div
                role="img"
                aria-label={`${i.nome}: saldo em ${diaMes(r.fim)} ${brlC(r.saldoFinal)}, menor saldo ${brlC(r.menorSaldo)} em ${diaMes(r.diaMenor)}`}
                className="relative h-36 border-b border-border"
              >
                {reservaMinima > 0 && (
                  <>
                    <div
                      aria-hidden
                      className="absolute inset-x-0 bottom-0"
                      style={{
                        top: `${Y(reservaMinima)}%`,
                        background: "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in oklab, var(--destructive) 12%, transparent) 6px 8px)",
                      }}
                    />
                    <div aria-hidden className="absolute inset-x-0 border-t-2 border-dashed border-muted-foreground" style={{ top: `${Y(reservaMinima)}%` }} />
                  </>
                )}
                {yMin < 0 && <div aria-hidden className="absolute inset-x-0 border-t border-destructive" style={{ top: `${Y(0)}%` }} />}
                <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
                  <path d={caminho(r.serie)} fill="none" stroke="var(--chart-1)" strokeWidth={2.25} vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-[13px]">
                <dt className="text-muted-foreground">Saldo em {diaMes(r.fim)}</dt>
                <dd className="text-right">
                  <Valor valor={r.saldoFinal / 100} sentido="neutro" />
                </dd>
                <dt className="text-muted-foreground">Menor saldo</dt>
                <dd className={cn("text-right", tom)}>
                  <Valor valor={r.menorSaldo / 100} sentido="neutro" /> <span className="text-xs">em {diaMes(r.diaMenor)}</span>
                </dd>
                <dt className="text-muted-foreground">Margem até a reserva</dt>
                <dd className="text-right">
                  <Valor valor={margem / 100} />
                </dd>
              </dl>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
