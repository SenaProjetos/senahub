import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Building2 } from "lucide-react";
import { requireUser } from "@/lib/session";
import { kpisHome } from "@/modules/qualidade/queries";
import { projetosRecentes, serieReceita, snapshotsDashboard } from "@/modules/dashboard/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { STATUS_CHIP, STATUS_LABEL } from "@/modules/projetos/status";
import { HeroCard } from "@/components/dashboard/hero-card";
import { ReceitaChart } from "@/components/dashboard/receita-chart";
import { TrendLine } from "@/components/qualidade/trend-line";
import { brlInteiro as brl } from "@/lib/utils";

export default async function HomePage() {
  const user = await requireUser();
  if (user.role === "cliente") redirect("/portal");
  const [kpis, projetos, receita, snapshots] = await Promise.all([
    kpisHome(),
    projetosRecentes(user),
    serieReceita(),
    snapshotsDashboard(30),
  ]);

  const cards = [
    { label: "Projetos ativos", value: String(kpis.projetosAtivos), delta: "em andamento" },
    { label: "Receita prevista", value: brl(kpis.receitaPrevista), delta: "contas a receber em aberto" },
    {
      label: "Entregas pendentes",
      value: String(kpis.entregasPendentes),
      delta: "disciplinas com prazo em 7 dias ou vencido",
    },
  ];

  return (
    <div className="space-y-6">
      <HeroCard nome={user.name} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
                {kpi.label}
              </CardDescription>
              <CardTitle className="text-3xl font-extrabold tracking-tight">{kpi.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{kpi.delta}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Receita — 6 meses</CardTitle>
            <CardDescription>Realizado (caixa) × previsto (a receber).</CardDescription>
          </CardHeader>
          <CardContent>
            <ReceitaChart dados={receita} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Projetos recentes</CardTitle>
            <CardDescription>Em andamento, por atualização.</CardDescription>
          </CardHeader>
          <CardContent>
            {projetos.length === 0 ? (
              <EmptyState icon={Building2} title="Nenhum projeto ativo." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="py-2 pr-3">Código</th>
                      <th className="py-2 pr-3">Projeto</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Progresso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {projetos.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/40">
                        <td className="py-2 pr-3">
                          <Link href={`/projetos/${p.id}`} className="font-mono text-xs text-primary hover:underline">
                            {formatarCodigo(p.codigo)}
                          </Link>
                        </td>
                        <td className="max-w-[180px] truncate py-2 pr-3" title={p.nome}>
                          {p.nome}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant="outline" className={STATUS_CHIP[p.status]}>
                            {STATUS_LABEL[p.status]}
                          </Badge>
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-sm bg-muted">
                              <div
                                className="h-full bg-gradient-to-r from-[var(--ring)] to-[var(--chart-1)]"
                                style={{ width: `${p.progresso}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs text-muted-foreground">{p.progresso}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {snapshots.length >= 2 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolução — projetos ativos</CardTitle>
            <CardDescription>Série histórica (snapshot diário dos KPIs).</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendLine
              pontos={snapshots.map((s) => ({
                rotulo: s.dia.slice(8, 10) + "/" + s.dia.slice(5, 7),
                valor: s.projetosAtivos,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
