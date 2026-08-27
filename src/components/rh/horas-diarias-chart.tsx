"use client";

import { useMemo, useState } from "react";
import { Clock, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import type { ProjetistaHorasDiarias } from "@/modules/rh/produtividade/queries";

const CORES = [
  { linha: "stroke-primary", ponto: "fill-primary", marcador: "bg-primary" },
  { linha: "stroke-info", ponto: "fill-info", marcador: "bg-info" },
  { linha: "stroke-warning", ponto: "fill-warning", marcador: "bg-warning" },
];

const LARGURA = 720;
const ALTURA = 250;
const MARGEM = { topo: 18, direita: 16, baixo: 34, esquerda: 34 };

function rotuloDia(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function rotuloHoras(horas: number) {
  return `${horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}

function tetoEscala(valor: number) {
  return Math.max(8, Math.ceil(valor / 2) * 2);
}

/**
 * Leitura visual do ritmo diário: uma linha por pessoa selecionada, até três
 * para manter a comparação útil em vez de virar uma massa de cores.
 */
export function HorasDiariasChart({
  dias,
  projetistas,
}: {
  dias: string[];
  projetistas: ProjetistaHorasDiarias[];
}) {
  const [selecionados, setSelecionados] = useState<string[]>(() => projetistas.slice(0, 1).map((p) => p.userId));
  const ativos = useMemo(
    () => projetistas.filter((p) => selecionados.includes(p.userId)),
    [projetistas, selecionados],
  );
  const maximo = tetoEscala(Math.max(0, ...ativos.flatMap((p) => p.dias.map((d) => d.horas))));
  const larguraUtil = LARGURA - MARGEM.esquerda - MARGEM.direita;
  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.baixo;
  const x = (indice: number) => MARGEM.esquerda + (indice / Math.max(dias.length - 1, 1)) * larguraUtil;
  const y = (horas: number) => MARGEM.topo + alturaUtil - (horas / maximo) * alturaUtil;
  const grades = [0, maximo / 2, maximo];

  function alternar(userId: string) {
    setSelecionados((atuais) => {
      if (atuais.includes(userId)) return atuais.filter((id) => id !== userId);
      return atuais.length >= 3 ? atuais : [...atuais, userId];
    });
  }

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-primary" /> Horas por dia
          </CardTitle>
          <CardDescription>Últimos 14 dias · selecione até três projetistas para comparar o ritmo de trabalho.</CardDescription>
        </div>
        {ativos.length > 0 && (
          <span className="font-mono text-sm font-semibold tabular-nums text-primary">
            {ativos.length === 1 ? `${ativos[0].nome}: ${rotuloHoras(ativos[0].totalHoras)}` : `${ativos.length} projetistas`}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {projetistas.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Sem horas registradas nos últimos 14 dias."
            description="O gráfico aparecerá quando houver jornadas ou apontamentos de projetistas."
            className="border-0 py-6 shadow-none"
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-2" aria-label="Projetistas exibidos no gráfico">
              {projetistas.map((p, indice) => {
                const ativo = selecionados.includes(p.userId);
                const cor = CORES[Math.max(0, selecionados.indexOf(p.userId)) % CORES.length];
                return (
                  <button
                    key={p.userId}
                    type="button"
                    aria-pressed={ativo}
                    disabled={!ativo && selecionados.length >= 3}
                    onClick={() => alternar(p.userId)}
                    className={`inline-flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45 ${
                      ativo ? "border-primary/50 bg-primary/5 text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className={`size-2 rounded-full ${ativo ? cor.marcador : "bg-muted-foreground/40"}`} aria-hidden />
                    <span>{p.nome}</span>
                    <span className="font-mono tabular-nums">{rotuloHoras(p.totalHoras)}</span>
                    {indice === 0 && <span className="sr-only">Maior total no período</span>}
                  </button>
                );
              })}
            </div>

            {ativos.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Selecione um projetista para visualizar as horas diárias.</p>
            ) : (
              <div className="overflow-x-auto">
                <svg
                  viewBox={`0 0 ${LARGURA} ${ALTURA}`}
                  role="img"
                  aria-label={`Comparativo diário de horas de ${ativos.map((p) => p.nome).join(", ")}`}
                  className="h-auto min-w-[620px] w-full"
                >
                  <title>Comparativo de horas por dia</title>
                  <desc>Cada linha mostra as horas registradas por dia para os projetistas selecionados.</desc>
                  {grades.map((valor) => (
                    <g key={valor}>
                      <line
                        x1={MARGEM.esquerda}
                        x2={LARGURA - MARGEM.direita}
                        y1={y(valor)}
                        y2={y(valor)}
                        className="stroke-border"
                        strokeDasharray={valor === 0 ? undefined : "3 3"}
                      />
                      <text x={MARGEM.esquerda - 7} y={y(valor) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
                        {rotuloHoras(valor)}
                      </text>
                    </g>
                  ))}
                  {dias.map((dia, indice) => (
                    <text
                      key={dia}
                      x={x(indice)}
                      y={ALTURA - 12}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[10px]"
                    >
                      {rotuloDia(dia)}
                    </text>
                  ))}
                  {ativos.map((p, indice) => {
                    const cor = CORES[indice % CORES.length];
                    const pontos = p.dias.map((item, diaIndice) => `${x(diaIndice)},${y(item.horas)}`).join(" ");
                    return (
                      <g key={p.userId}>
                        <polyline points={pontos} fill="none" className={cor.linha} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                        {p.dias.map((item, diaIndice) => (
                          <g key={item.dia}>
                            <title>{`${p.nome} · ${rotuloDia(item.dia)}: ${rotuloHoras(item.horas)}`}</title>
                            <circle cx={x(diaIndice)} cy={y(item.horas)} r="3" className={cor.ponto} />
                          </g>
                        ))}
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda do gráfico">
              {ativos.map((p, indice) => (
                <span key={p.userId} className="inline-flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${CORES[indice % CORES.length].marcador}`} aria-hidden />
                  {p.nome} · {ROLE_LABELS[p.role as Role] ?? p.role}
                </span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
