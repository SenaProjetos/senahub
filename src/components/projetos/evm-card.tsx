import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/utils";
import type { EvmData } from "@/modules/projetos/evm/queries";

function IndiceChip({ valor, label }: { valor: number | null; label: string }) {
  if (valor === null) return null;
  const cor =
    valor >= 0.95 ? "default" : valor >= 0.8 ? "secondary" : "destructive";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant={cor} className="font-mono">
        {valor.toFixed(2)}
      </Badge>
    </div>
  );
}

function ProgressBar({ valor, max }: { valor: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (valor / max) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EvmCard({ evm }: { evm: EvmData }) {
  const evPct = evm.bac > 0 ? (evm.ev / evm.bac) * 100 : 0;
  const pvPct = evm.bac > 0 ? (evm.pv / evm.bac) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">EVM — Valor Agregado</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Barras PV vs EV */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>PV planejado</span>
            <span className="font-mono">{brl(evm.pv)} ({pvPct.toFixed(0)}%)</span>
          </div>
          <ProgressBar valor={evm.pv} max={evm.bac} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>EV realizado</span>
            <span className="font-mono">{brl(evm.ev)} ({evPct.toFixed(0)}%)</span>
          </div>
          <ProgressBar valor={evm.ev} max={evm.bac} />
        </div>

        {/* Métricas em grade */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">BAC (orçamento)</span>
            <span className="font-mono font-semibold">{brl(evm.bac)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">AC (custo real)</span>
            <span className="font-mono font-semibold">{brl(evm.ac)}</span>
          </div>
          {evm.eac !== null && (
            <div className="flex flex-col col-span-2">
              <span className="text-xs text-muted-foreground">EAC (estimativa no término)</span>
              <span className="font-mono font-semibold">{brl(evm.eac)}</span>
            </div>
          )}
        </div>

        {/* Índices SPI / CPI */}
        <div className="space-y-1.5 border-t pt-3">
          <IndiceChip valor={evm.spi} label="SPI — desempenho de prazo (> 1 adiantado)" />
          <IndiceChip valor={evm.cpi} label="CPI — desempenho de custo (> 1 abaixo do orçamento)" />
        </div>
      </CardContent>
    </Card>
  );
}
