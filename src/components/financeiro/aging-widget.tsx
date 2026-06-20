"use client";

import type { AgingReport } from "@/modules/financeiro/aging/queries";
import { FAIXA_COR, type FaixaAging } from "@/lib/aging";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brlInteiro } from "@/lib/utils";

function Painel({ report }: { report: AgingReport }) {
  const max = Math.max(1, ...report.porFaixa.map((f) => f.total));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-sm border p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Total vencido</p>
          <p className="font-mono text-xl font-bold text-destructive">{brlInteiro(report.totalVencido)}</p>
        </div>
        <div className="rounded-sm border p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">A vencer</p>
          <p className="font-mono text-xl font-bold">{brlInteiro(report.totalAVencer)}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {report.porFaixa.map((f) => (
          <div key={f.faixa} className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 text-muted-foreground">{f.label}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
              <div className={`h-full ${FAIXA_COR[f.faixa as FaixaAging]}`} style={{ width: `${(f.total / max) * 100}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right font-mono">{brlInteiro(f.total)}</span>
            <span className="w-6 shrink-0 text-right font-mono text-muted-foreground">{f.qtd}</span>
          </div>
        ))}
      </div>

      {report.topVencidos.length > 0 && (
        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Mais vencidos</p>
          <ul className="divide-y text-sm">
            {report.topVencidos.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate">{t.descricao}</span>
                <span className="shrink-0 font-mono text-xs text-destructive">{t.diasAtraso}d</span>
                <span className="w-24 shrink-0 text-right font-mono text-xs">{brlInteiro(t.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AgingWidget({ receber, pagar }: { receber: AgingReport; pagar: AgingReport }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Aging — vencidos e a vencer</CardTitle>
        <CardDescription>Lançamentos previstos por faixa de atraso.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="receber">
          <TabsList>
            <TabsTrigger value="receber">Recebíveis</TabsTrigger>
            <TabsTrigger value="pagar">Pagáveis</TabsTrigger>
          </TabsList>
          <div className="mt-3">
            <TabsContent value="receber">
              <Painel report={receber} />
            </TabsContent>
            <TabsContent value="pagar">
              <Painel report={pagar} />
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
