import type { Metadata } from "next";
import Link from "next/link";
import { Gauge } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { indiceQualidadeAtual, snapshotsQualidade, slaEntregas } from "@/modules/qualidade/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { TrendLine } from "@/components/qualidade/trend-line";
import { IndiceGauge } from "@/components/qualidade/indice-gauge";

export const metadata: Metadata = { title: "Qualidade" };

export default async function QualidadePage() {
  await requirePermission("qualidade", "ver");
  const [atual, snapshots, sla] = await Promise.all([
    indiceQualidadeAtual(),
    snapshotsQualidade(),
    slaEntregas(),
  ]);

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
          <CardContent className="flex justify-center pt-0">
            <IndiceGauge indice={atual.indice} />
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

      <div>
        <h3 className="mb-2 text-lg font-bold tracking-tight">SLA de entregas</h3>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">% no prazo</CardDescription>
              <CardTitle className={`text-3xl ${sla.percentualNoPrazo < 70 ? "text-destructive" : sla.percentualNoPrazo < 90 ? "text-warning" : "text-success"}`}>
                {sla.percentualNoPrazo}%
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Entregues no prazo</CardDescription>
              <CardTitle className="text-3xl text-success">{sla.noPrazo}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Entregues atrasadas</CardDescription>
              <CardTitle className="text-3xl text-warning">{sla.atrasadasEntregues}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Pendentes vencidas</CardDescription>
              <CardTitle className="text-3xl text-destructive">{sla.pendentesVencidas}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Pendentes em dia</CardDescription>
              <CardTitle className="text-3xl">{sla.pendentesEmDia}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      </div>

      {sla.atrasos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Maiores atrasos</CardTitle>
            <CardDescription>Disciplinas entregues após o prazo ou pendentes vencidas.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {sla.atrasos.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                  <Link href={`/projetos/${a.projetoId}`} className="hover:underline">
                    <span className="font-mono text-xs text-primary">{a.projeto}</span> · {a.nome}
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={a.entregue ? "border-warning/40 text-warning" : "border-destructive/40 text-destructive"}>
                      {a.entregue ? "atrasada" : "vencida"}
                    </Badge>
                    <span className="w-12 text-right font-mono text-xs">+{a.dias}d</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revisões por disciplina</CardTitle>
        </CardHeader>
        <CardContent>
          {atual.porDisciplina.length === 0 ? (
            <EmptyState icon={Gauge} title="Sem disciplinas ativas." />
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
            <EmptyState icon={Gauge} title="Nenhum snapshot ainda." />
          ) : (
            <>
              <TrendLine
                unidade="%"
                descricao="Tendência do índice de retrabalho (%) por mês"
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
