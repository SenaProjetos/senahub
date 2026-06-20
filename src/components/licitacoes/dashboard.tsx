import Link from "next/link";
import { formatarData } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_CHIP, brl } from "./_shared";
import type { DashboardLicitacoes } from "@/modules/licitacoes/dashboard/queries";

export function DashboardLicitacoes({ data }: { data: DashboardLicitacoes }) {
  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Total" valor={String(data.total)} />
        <Kpi titulo="Taxa de vitória" valor={`${data.taxaVitoria}%`} />
        <Kpi titulo="Valor em disputa" valor={brl(data.valorEmDisputa)} />
        <Kpi titulo="Valor em execução" valor={brl(data.valorEmExecucao)} />
      </div>

      {/* Funil por status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Funil por status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {data.porStatus.map((s) => (
            <div key={s.status} className="flex items-center gap-2">
              <Badge variant="outline" className={STATUS_CHIP[s.status]}>
                {STATUS_LABEL[s.status]}
              </Badge>
              <span className="text-sm font-semibold">{s.count}</span>
              {s.valor > 0 && (
                <span className="font-mono text-xs text-muted-foreground">
                  {brl(s.valor)}
                </span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Próximos prazos */}
      {data.proximosPrazos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Próximos prazos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {data.proximosPrazos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/licitacoes/${p.id}`}
                    className="text-primary hover:underline"
                  >
                    {p.titulo}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatarData(p.prazoProposta)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="text-2xl font-extrabold tracking-tight">{valor}</p>
      </CardContent>
    </Card>
  );
}
