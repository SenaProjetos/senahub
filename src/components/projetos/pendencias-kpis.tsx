import { ClipboardList, Gauge, History } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstatisticasPendencias } from "@/modules/projetos/pendencias/queries";

function Tile({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
      <div className="mt-0.5 rounded-md bg-muted p-2">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-0.5 font-mono text-xl font-bold tabular-nums")}>{value}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

/** Indicadores de apontamentos do projeto (item 37) — mesmo molde visual do ProjetoKpis. */
export function PendenciasKpis({ stats }: { stats: EstatisticasPendencias }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Tile
        icon={History}
        label="Tempo médio de resolução"
        value={stats.tempoMedioResolucaoDias != null ? `${stats.tempoMedioResolucaoDias.toFixed(1)}d` : "—"}
        sub={stats.tempoMedioResolucaoDias != null ? "da criação até resolvido/fechado" : "nenhum apontamento encerrado ainda"}
      />
      <Tile
        icon={Gauge}
        label="Densidade de apontamentos"
        value={stats.densidadePorPrancha != null ? stats.densidadePorPrancha.toFixed(2) : "—"}
        sub="apontamentos abertos por prancha"
      />
      <Tile
        icon={ClipboardList}
        label="Revisões até zerar"
        value={stats.revisoesAteZerarMedia != null ? stats.revisoesAteZerarMedia.toFixed(1) : "—"}
        sub={stats.revisoesAteZerarMedia != null ? "média entre documentos já zerados" : "nenhum documento zerou apontamentos ainda"}
      />
    </div>
  );
}
