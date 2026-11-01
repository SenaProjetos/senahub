"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { brl } from "@/lib/utils";
import { fmtHoras } from "@/modules/ponto/format";
import type { LinhaHoras } from "@/modules/projetos/horas-disciplina";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/** Cor da barra de consumo: passou do orçado = vermelho; perto do limite = alerta. */
function tomDaBarra(pct: number): string {
  if (pct > 100) return "bg-destructive";
  if (pct >= 85) return "bg-warning";
  return "bg-success";
}

function Consumo({ realizadoMin, orcadoMin }: { realizadoMin: number; orcadoMin: number | null }) {
  if (orcadoMin === null) return <span className="text-xs text-muted-foreground">sem linha de base</span>;
  if (orcadoMin === 0) return <span className="text-xs text-muted-foreground">sem horas orçadas</span>;
  const pct = Math.round((realizadoMin / orcadoMin) * 100);
  return (
    <div className="flex items-center gap-2" title={`${pct}% do orçado já realizado`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Realizado sobre orçado">
        <div className={`h-full ${tomDaBarra(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums">{pct}%</span>
    </div>
  );
}

/**
 * Horas por disciplina do projeto (R5.4): orçado (linha de base) × planejado (EAP de hoje) × realizado
 * (ponto), com a barra do consumo. O que cada pessoa vê já vem filtrado do servidor — coordenador
 * enxerga as horas por pessoa, os demais só as próprias; os reais só chegam a quem pode ver custo.
 */
export function HorasDisciplinaCard({ linhas, temLinhaDeBase, podeVerCusto }: { linhas: LinhaHoras[]; temLinhaDeBase: boolean; podeVerCusto: boolean }) {
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const alternar = (id: string) =>
    setAbertas((prev) => {
      const novo = new Set(prev);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });

  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle className="text-sm">Horas por disciplina</CardTitle>
        <CardDescription>
          {temLinhaDeBase ? "Orçado pela linha de base, planejado pela EAP de hoje e realizado pelo ponto." : "Sem linha de base: aprove o cronograma para ter o orçado."}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto">
        {linhas.length === 0 ? (
          <EmptyState title="Nenhuma disciplina neste projeto" />
        ) : (
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Disciplina</th>
                <th className="py-1 pr-2 text-right font-medium">Orçado</th>
                <th className="py-1 pr-2 text-right font-medium">Planejado</th>
                <th className="py-1 pr-2 text-right font-medium">Realizado</th>
                <th className="py-1 pr-2 font-medium">Consumo</th>
                {podeVerCusto && <th className="py-1 text-right font-medium">Custo</th>}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const aberta = abertas.has(l.disciplinaId);
                const temPessoas = l.porPessoa.length > 0;
                return (
                  <Fragment key={l.disciplinaId}>
                    <tr className="border-t">
                      <td className="max-w-48 py-1.5 pr-2">
                        {temPessoas ? (
                          <button
                            type="button"
                            onClick={() => alternar(l.disciplinaId)}
                            aria-expanded={aberta}
                            aria-label={`${aberta ? "Recolher" : "Ver"} horas por pessoa em ${l.nome}`}
                            className="flex w-full items-center gap-1 text-left font-medium hover:underline"
                          >
                            {aberta ? <ChevronDown className="size-3.5 shrink-0" aria-hidden /> : <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
                            <span className="truncate">{l.nome}</span>
                          </button>
                        ) : (
                          <span className="block truncate pl-[1.125rem] font-medium">{l.nome}</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{l.orcadoMin === null ? "—" : fmtHoras(l.orcadoMin)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{fmtHoras(l.planejadoMin)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{fmtHoras(l.realizadoMin)}</td>
                      <td className="py-1.5 pr-2">
                        <Consumo realizadoMin={l.realizadoMin} orcadoMin={l.orcadoMin} />
                      </td>
                      {podeVerCusto && <td className="py-1.5 text-right font-mono tabular-nums">{brl((l.custoCent ?? 0) / 100)}</td>}
                    </tr>
                    {aberta &&
                      l.porPessoa.map((p) => (
                        <tr key={p.userId} className="text-xs text-muted-foreground">
                          <td className="py-0.5 pl-6 pr-2">{p.nome}</td>
                          <td />
                          <td />
                          <td className="py-0.5 pr-2 text-right font-mono tabular-nums">{fmtHoras(p.minutos)}</td>
                          <td />
                          {podeVerCusto && <td />}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
