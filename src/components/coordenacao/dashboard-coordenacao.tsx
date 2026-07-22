import type {
  ContagemStatus,
  ContagemDisciplina,
  PontoSemana,
} from "@/modules/coordenacao/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  resolvida: "Resolvida",
  fechada: "Fechada",
  descartada: "Descartada",
};
const STATUS_COR: Record<string, string> = {
  aberta: "bg-warning",
  resolvida: "bg-info",
  fechada: "bg-status-aprovado",
  descartada: "bg-muted-foreground",
};

function CardStatus({ status }: { status: ContagemStatus[] }) {
  const total = status.reduce((s, x) => s + x.total, 0);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Apontamentos por status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {total === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum apontamento ainda.</p>
        ) : (
          status.map((s) => {
            const pct = total > 0 ? Math.round((s.total / total) * 100) : 0;
            return (
              <div key={s.status} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{STATUS_LABEL[s.status] ?? s.status}</span>
                  <span className="font-medium">{s.total}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${STATUS_COR[s.status] ?? "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function CardDisciplinas({ disciplinas }: { disciplinas: ContagemDisciplina[] }) {
  const max = Math.max(1, ...disciplinas.map((d) => d.total));
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Apontamentos por disciplina</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {disciplinas.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum apontamento ainda.</p>
        ) : (
          disciplinas.map((d) => (
            <div key={d.disciplina} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate text-muted-foreground">{d.disciplina}</span>
                <span className="font-medium">
                  {d.total} {d.abertos > 0 && <span className="text-warning">({d.abertos} aberto{d.abertos > 1 ? "s" : ""})</span>}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(d.total / max) * 100}%` }} />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function CardBurndown({ semanas }: { semanas: PontoSemana[] }) {
  const max = Math.max(1, ...semanas.flatMap((s) => [s.criados, s.encerrados]));
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          Criados vs. encerrados <span className="font-normal text-muted-foreground">(últimas {semanas.length} semanas)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-32 items-end gap-2">
          {semanas.map((s) => (
            <div key={s.semana} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end justify-center gap-0.5">
                <div
                  className="w-2.5 rounded-t bg-warning"
                  style={{ height: `${(s.criados / max) * 100}%` }}
                  title={`${s.criados} criado(s)`}
                />
                <div
                  className="w-2.5 rounded-t bg-status-aprovado"
                  style={{ height: `${(s.encerrados / max) * 100}%` }}
                  title={`${s.encerrados} encerrado(s)`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{s.semana}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-warning" /> Criados
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-status-aprovado" /> Encerrados
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Dashboard de apontamentos de coordenação: status, disciplina, burndown semanal. */
export function DashboardCoordenacao({
  status,
  disciplinas,
  semanas,
}: {
  status: ContagemStatus[];
  disciplinas: ContagemDisciplina[];
  semanas: PontoSemana[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <CardStatus status={status} />
      <CardDisciplinas disciplinas={disciplinas} />
      <div className="md:col-span-2 lg:col-span-1">
        <CardBurndown semanas={semanas} />
      </div>
    </div>
  );
}
