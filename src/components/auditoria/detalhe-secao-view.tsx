import { ACAO_LABEL } from "@/modules/auditoria/labels";
import type { DetalheSecao } from "@/modules/auditoria/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendLine } from "@/components/qualidade/trend-line";

function Stat({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</p>
        <p className={`text-2xl font-extrabold tracking-tight ${alerta && valor > 0 ? "text-red-600 dark:text-red-500" : ""}`}>{valor}</p>
      </CardContent>
    </Card>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: { rotulo: string; total: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados no período.</p>
        ) : (
          <ul className="space-y-1.5">
            {itens.map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{it.rotulo}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{it.total}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Drill-down de uma seção: totais, série diária, top ações e top usuários. */
export function DetalheSecaoView({ d }: { d: DetalheSecao }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat rotulo="Acessos" valor={d.totalAcessos} />
        <Stat rotulo="Ações" valor={d.totalAcoes} />
        <Stat rotulo="Falhas" valor={d.falhas} alerta />
        <Stat rotulo="Bloqueios" valor={d.bloqueios} alerta />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Acessos por dia</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendLine pontos={d.serie} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Lista titulo="Top ações" itens={d.topAcoes.map((a) => ({ rotulo: ACAO_LABEL[a.acao] ?? a.acao, total: a.total }))} />
        <Lista titulo="Top usuários" itens={d.topUsuarios.map((u) => ({ rotulo: u.nome, total: u.total }))} />
      </div>
    </div>
  );
}
