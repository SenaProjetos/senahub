import { Activity } from "lucide-react";
import { moduloLabel } from "@/modules/auditoria/labels";
import type { HeatmapUso } from "@/modules/auditoria/heatmap";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

function ddmm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Cor da célula proporcional à intensidade (0 = transparente). */
function corCelula(v: number, max: number): string {
  if (v <= 0 || max <= 0) return "transparent";
  const pct = 15 + Math.round((85 * v) / max);
  return `color-mix(in oklab, var(--primary) ${pct}%, transparent)`;
}

/**
 * Heatmap de uso por seção: matriz seção (linhas) × dia (colunas), célula
 * colorida pela intensidade de ações. Componente de servidor (sem interação).
 */
export function HeatmapUsoView({ data, dias }: { data: HeatmapUso; dias: number }) {
  if (data.totalGeral === 0) {
    return (
      <Card>
        <CardContent className="py-10">
          <EmptyState icon={Activity} title="Sem atividade registrada no período." />
        </CardContent>
      </Card>
    );
  }

  const cols = `minmax(120px, 200px) repeat(${data.dias.length}, minmax(0, 1fr))`;

  return (
    <Card>
      <CardContent className="overflow-x-auto p-4">
        <div className="min-w-[640px]">
          {/* Cabeçalho dos dias */}
          <div className="grid items-end gap-1" style={{ gridTemplateColumns: cols }}>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Seção</div>
            {data.dias.map((iso) => (
              <div key={iso} className="text-center font-mono text-[9px] text-muted-foreground" title={ddmm(iso)}>
                {iso.split("-")[2]}
              </div>
            ))}
          </div>

          {/* Linhas (uma por seção) */}
          <div className="mt-1 space-y-1">
            {data.modulos.map((m, i) => (
              <div key={m.modulo} className="grid items-center gap-1" style={{ gridTemplateColumns: cols }}>
                <div className="flex items-center justify-between gap-2 pr-2">
                  <span className="truncate text-xs font-medium">{moduloLabel(m.modulo)}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{m.total}</span>
                </div>
                {data.matriz[i].map((v, j) => (
                  <div
                    key={j}
                    className="aspect-square rounded-[2px] border border-border/40"
                    style={{ backgroundColor: corCelula(v, data.max) }}
                    title={`${moduloLabel(m.modulo)} · ${ddmm(data.dias[j])}: ${v} ${v === 1 ? "ação" : "ações"}`}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Legenda */}
          <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
            <span>menos</span>
            {[0, 0.25, 0.5, 0.75, 1].map((t, k) => (
              <span
                key={k}
                className="size-3 rounded-[2px] border border-border/40"
                style={{ backgroundColor: t === 0 ? "transparent" : `color-mix(in oklab, var(--primary) ${15 + 85 * t}%, transparent)` }}
              />
            ))}
            <span>mais</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
