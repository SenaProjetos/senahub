import { Card, CardContent } from "@/components/ui/card";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function cor(v: number, max: number): string {
  if (v <= 0 || max <= 0) return "transparent";
  const pct = 15 + Math.round((85 * v) / max);
  return `color-mix(in oklab, var(--primary) ${pct}%, transparent)`;
}

/** Heatmap dia-da-semana × hora (quando o sistema é usado). */
export function HeatmapDiaHora({ data }: { data: { matriz: number[][]; max: number } }) {
  const cols = `36px repeat(24, minmax(0, 1fr))`;
  return (
    <Card>
      <CardContent className="overflow-x-auto p-4">
        <div className="min-w-[640px]">
          {/* horas */}
          <div className="grid items-end gap-[2px]" style={{ gridTemplateColumns: cols }}>
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="text-center font-mono text-[8px] text-muted-foreground">
                {h % 3 === 0 ? h : ""}
              </div>
            ))}
          </div>
          <div className="mt-[2px] space-y-[2px]">
            {data.matriz.map((linha, d) => (
              <div key={d} className="grid items-center gap-[2px]" style={{ gridTemplateColumns: cols }}>
                <div className="font-mono text-[10px] text-muted-foreground">{DIAS[d]}</div>
                {linha.map((v, h) => (
                  <div
                    key={h}
                    className="aspect-square rounded-[2px] border border-border/40"
                    style={{ backgroundColor: cor(v, data.max) }}
                    title={`${DIAS[d]} ${String(h).padStart(2, "0")}h: ${v} ${v === 1 ? "acesso" : "acessos"}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
