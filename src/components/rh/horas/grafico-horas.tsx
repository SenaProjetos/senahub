"use client";

import { useMemo, useRef, useState } from "react";
import { bucketsDoPeriodo, type Granularidade } from "@/modules/rh/produtividade/periodo";
import { somarPorBucket } from "@/modules/rh/produtividade/horas";
import { proximoFoco, rotuloDia, rotuloHoras } from "./formato";

export type SerieGrafico = { chave: string; rotulo: string; cor: string; valores: number[] };

const LARGURA = 720;
const ALTURA = 250;
const M = { topo: 18, direita: 16, baixo: 34, esquerda: 38 };

function teto(valor: number) {
  return Math.max(8, Math.ceil(valor / 2) * 2);
}

/**
 * Horas no tempo. `linhas` = uma linha por série (comparação de pessoas); `empilhado` = barras
 * empilhadas (destinos de uma pessoa). Acima do limite diário o período chega agrupado por semana.
 * A tabela embaixo repete os números: a leitura nunca depende só da cor.
 */
export function GraficoHoras({
  dias,
  granularidade,
  modo,
  series,
  titulo,
}: {
  dias: string[];
  granularidade: Granularidade;
  modo: "linhas" | "empilhado";
  series: SerieGrafico[];
  titulo: string;
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const [ativo, setAtivo] = useState(0);
  const faixas = useRef<(SVGRectElement | null)[]>([]);
  const buckets = useMemo(() => bucketsDoPeriodo(dias, granularidade), [dias, granularidade]);
  const valores = useMemo(() => series.map((s) => somarPorBucket(s.valores, buckets)), [series, buckets]);
  // Período que cruza a virada de ano repete "dd/mm": aí o rótulo leva o ano.
  const variosAnos = dias.length > 0 && dias[0].slice(0, 4) !== dias[dias.length - 1].slice(0, 4);
  const rotulos = buckets.map((b) => {
    const dia = variosAnos ? `${rotuloDia(b.inicio)}/${b.inicio.slice(2, 4)}` : rotuloDia(b.inicio);
    return granularidade === "semana" ? `sem. ${dia}` : dia;
  });
  const totais = buckets.map((_, i) => valores.reduce((s, v) => s + v[i], 0));

  // `reduce`, não `Math.max(...)`: período longo tem milhares de valores e o spread estoura a pilha.
  const maior = (lista: number[]) => lista.reduce((m, v) => (v > m ? v : m), 0);
  const maximo = teto(modo === "empilhado" ? maior(totais) : valores.reduce((m, v) => Math.max(m, maior(v)), 0));
  const larguraUtil = LARGURA - M.esquerda - M.direita;
  const alturaUtil = ALTURA - M.topo - M.baixo;
  const n = buckets.length;
  const passo = larguraUtil / Math.max(n, 1);
  const xCentro = (i: number) => M.esquerda + passo * (i + 0.5);
  const y = (h: number) => M.topo + alturaUtil - (h / maximo) * alturaUtil;
  const larguraBarra = Math.max(2, Math.min(28, passo * 0.7));
  const cadaQuantos = Math.max(1, Math.ceil(n / 14)); // no máximo ~14 rótulos no eixo

  const anuncio = (i: number) =>
    `${rotulos[i]}: ` + series.map((s, k) => `${s.rotulo} ${rotuloHoras(valores[k][i])}`).join(", ");

  return (
    <div className="min-w-0 space-y-3">
      <p className="text-xs text-muted-foreground">
        {titulo}
        {granularidade === "semana" && " · por semana — período longo"}
      </p>
      <div className="overflow-x-auto">
        {/* `group`, não `img`: filho de `img` é decorativo para o leitor de tela e as faixas sumiriam. */}
        <svg
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          role="group"
          aria-label={`${titulo}. Use as setas para andar entre ${granularidade === "semana" ? "as semanas" : "os dias"}.`}
          className="h-auto w-full min-w-[560px]"
        >
          {[0, maximo / 2, maximo].map((v) => (
            <g key={v}>
              <line
                x1={M.esquerda}
                x2={LARGURA - M.direita}
                y1={y(v)}
                y2={y(v)}
                className="stroke-border"
                strokeDasharray={v === 0 ? undefined : "3 3"}
              />
              <text x={M.esquerda - 7} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
                {rotuloHoras(v)}
              </text>
            </g>
          ))}
          {rotulos.map((r, i) =>
            i % cadaQuantos === 0 ? (
              <text key={i} x={xCentro(i)} y={ALTURA - 12} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {r}
              </text>
            ) : null,
          )}

          {foco !== null && (
            <rect x={M.esquerda + passo * foco} y={M.topo} width={passo} height={alturaUtil} className="fill-foreground/5" />
          )}

          {modo === "empilhado"
            ? buckets.map((_, i) => {
                let base = 0;
                return (
                  <g key={i}>
                    {series.map((s, k) => {
                      const h = valores[k][i];
                      if (h <= 0) return null;
                      const topo = y(base + h);
                      const altura = y(base) - topo;
                      base += h;
                      return (
                        <rect key={s.chave} x={xCentro(i) - larguraBarra / 2} y={topo} width={larguraBarra} height={altura} fill={s.cor} />
                      );
                    })}
                  </g>
                );
              })
            : series.map((s, k) => (
                <g key={s.chave}>
                  <polyline
                    points={valores[k].map((h, i) => `${xCentro(i)},${y(h)}`).join(" ")}
                    fill="none"
                    stroke={s.cor}
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {n <= 45 && valores[k].map((h, i) => <circle key={i} cx={xCentro(i)} cy={y(h)} r="3" fill={s.cor} />)}
                </g>
              ))}

          {/* Faixas focáveis: teclado e leitor de tela leem o valor de cada dia/semana. Uma parada de
              Tab só (a faixa "ativa"); as setas andam entre elas. */}
          {buckets.map((_, i) => (
            <rect
              key={`foco-${i}`}
              ref={(el) => {
                faixas.current[i] = el;
              }}
              x={M.esquerda + passo * i}
              y={M.topo}
              width={passo}
              height={alturaUtil}
              fill="transparent"
              className="outline-none focus-visible:stroke-ring"
              strokeWidth={2}
              tabIndex={i === Math.min(ativo, n - 1) ? 0 : -1}
              role="img"
              aria-label={anuncio(i)}
              onKeyDown={(e) => {
                const proximo = proximoFoco(i, e.key, n);
                if (proximo === null) return;
                e.preventDefault();
                setAtivo(proximo);
                faixas.current[proximo]?.focus();
              }}
              onFocus={() => {
                setAtivo(i);
                setFoco(i);
              }}
              onBlur={() => setFoco(null)}
              onMouseEnter={() => setFoco(i)}
              onMouseLeave={() => setFoco(null)}
            >
              <title>{anuncio(i)}</title>
            </rect>
          ))}
        </svg>
      </div>

      {foco !== null && (
        <p className="text-xs tabular-nums text-foreground" aria-hidden>
          {anuncio(foco)}
        </p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda do gráfico">
        {series.map((s) => (
          <span key={s.chave} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: s.cor }} aria-hidden />
            {s.rotulo}
          </span>
        ))}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver os números</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[480px] border-separate border-spacing-0 text-right tabular-nums">
            <thead>
              <tr className="text-muted-foreground">
                <th className="sticky left-0 bg-card px-2 py-1 text-left font-normal">{granularidade === "semana" ? "Semana" : "Dia"}</th>
                {series.map((s) => (
                  <th key={s.chave} className="px-2 py-1 font-normal">
                    {s.rotulo}
                  </th>
                ))}
                {modo === "empilhado" && <th className="px-2 py-1 font-normal">Total</th>}
              </tr>
            </thead>
            <tbody>
              {buckets.map((_, i) => (
                <tr key={i}>
                  <td className="sticky left-0 bg-card px-2 py-1 text-left">{rotulos[i]}</td>
                  {series.map((s, k) => (
                    <td key={s.chave} className="px-2 py-1">
                      {valores[k][i] > 0 ? rotuloHoras(valores[k][i]) : "·"}
                    </td>
                  ))}
                  {modo === "empilhado" && <td className="px-2 py-1 font-semibold">{rotuloHoras(totais[i])}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
