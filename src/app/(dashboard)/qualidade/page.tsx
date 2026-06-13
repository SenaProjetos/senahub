import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { indiceQualidadeAtual, snapshotsQualidade } from "@/modules/qualidade/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendLine } from "@/components/qualidade/trend-line";

export const metadata: Metadata = { title: "Qualidade" };

export default async function QualidadePage() {
  await requirePermission("qualidade", "ver");
  const [atual, snapshots] = await Promise.all([indiceQualidadeAtual(), snapshotsQualidade()]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Índice de qualidade</h2>
        <p className="text-sm text-muted-foreground">
          Retrabalho = % de disciplinas ativas com ao menos uma revisão (RVxx). Menor é melhor.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
              Índice de retrabalho
            </CardDescription>
            <CardTitle
              className={`text-3xl ${atual.indice > 30 ? "text-destructive" : atual.indice > 15 ? "text-warning" : "text-success"}`}
            >
              {atual.indice.toFixed(1)}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 overflow-hidden rounded-sm bg-muted">
              <div
                className={`h-full ${atual.indice > 30 ? "bg-destructive" : atual.indice > 15 ? "bg-warning" : "bg-success"}`}
                style={{ width: `${Math.min(100, atual.indice)}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
              Disciplinas ativas
            </CardDescription>
            <CardTitle className="text-3xl">{atual.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
              Com revisão
            </CardDescription>
            <CardTitle className="text-3xl">{atual.comRevisao}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revisões por disciplina</CardTitle>
        </CardHeader>
        <CardContent>
          {atual.porDisciplina.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem disciplinas ativas.</p>
          ) : (
            <ul className="space-y-2">
              {atual.porDisciplina.map((d) => {
                const max = Math.max(...atual.porDisciplina.map((x) => x.revisoes), 1);
                return (
                  <li key={d.nome} className="flex items-center gap-3 text-sm">
                    <span className="w-40 truncate">{d.nome}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
                      <div
                        className="h-full bg-status-revisao"
                        style={{ width: `${(d.revisoes / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-20 text-right font-mono text-xs text-muted-foreground">
                      {d.revisoes} rev · {d.total} disc
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico mensal (snapshots)</CardTitle>
          <CardDescription>Gravado automaticamente todo dia 1º.</CardDescription>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum snapshot ainda.</p>
          ) : (
            <>
              <TrendLine
                pontos={[...snapshots]
                  .reverse()
                  .map((s) => ({
                    rotulo: `${String(s.mes).padStart(2, "0")}/${String(s.ano).slice(2)}`,
                    valor: Number(s.indice),
                  }))}
              />
              <ul className="mt-4 divide-y text-sm">
              {snapshots.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-1.5">
                  <span className="font-mono">
                    {String(s.mes).padStart(2, "0")}/{s.ano}
                  </span>
                  <span className="text-muted-foreground">
                    {s.comRevisao}/{s.totalDisciplinas} disciplinas
                  </span>
                  <span className="font-mono font-semibold">{Number(s.indice).toFixed(1)}%</span>
                </li>
              ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
