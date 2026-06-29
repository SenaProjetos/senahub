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
import { Sparkline } from "@/components/ui/sparkline";
import { Building2, Upload, MessageSquare, Clock, KanbanSquare, type LucideIcon } from "lucide-react";
import { requireUser } from "@/lib/session";
import { kpisHome } from "@/modules/qualidade/queries";
import { agingReport } from "@/modules/financeiro/aging/queries";
import { projetosRecentes, serieReceita, snapshotsDashboard, carteiraProjetosDashboard, aniversariantesDoMes, humorDeHoje, kpisProjetista } from "@/modules/dashboard/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { STATUS_CHIP, STATUS_LABEL } from "@/modules/projetos/status";
import { HeroCard } from "@/components/dashboard/hero-card";
import { ReceitaChart } from "@/components/dashboard/receita-chart";
import { TrendLine } from "@/components/qualidade/trend-line";
import { CarteiraDashboard } from "@/components/dashboard/carteira-dashboard";
import { brlInteiro as brl } from "@/lib/utils";
import { acessoGlobal } from "@/lib/roles";
import { podeVerFinanceiro } from "@/lib/permissions";

const ACOES_RAPIDAS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Enviar entrega", href: "/projetos/meu-trabalho", icon: Upload },
  { label: "Abrir chat", href: "/chat", icon: MessageSquare },
  { label: "Registrar ponto", href: "/ponto", icon: Clock },
  { label: "Nova tarefa", href: "/tarefas", icon: KanbanSquare },
];

/** Card de KPI do colaborador com mini-sparkline (série de eventos dos últimos 14 dias). */
function KpiSpark({ label, valor, serie, href }: { label: string; valor: number; serie: number[]; href: string }) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardHeader className="pb-2">
          <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">{label}</CardDescription>
          <CardTitle className="text-3xl font-extrabold tracking-tight">{valor}</CardTitle>
        </CardHeader>
        <CardContent>
          <Sparkline serie={serie} />
          <p className="mt-1 text-[10px] text-muted-foreground">últimos 14 dias</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function HomePage() {
  const user = await requireUser();
  if (user.role === "cliente") redirect("/portal");
  const isGlobal = acessoGlobal(user);
  // Item 5: só busca/expõe dado financeiro a quem pode ver (financeiro:ver ou sócio ativo).
  const verFin = await podeVerFinanceiro(user);
  const [kpis, projetos, snapshots, receita, agingReceita, carteira, aniversarios, humorHoje] = await Promise.all([
    kpisHome(),
    projetosRecentes(user),
    snapshotsDashboard(30),
    verFin ? serieReceita() : Promise.resolve([]),
    verFin ? agingReport("receita") : Promise.resolve(null),
    isGlobal && verFin ? carteiraProjetosDashboard() : Promise.resolve([]),
    aniversariantesDoMes(),
    humorDeHoje(user.id),
  ]);
  const kpisMeu = await kpisProjetista(user.id);

  const cards = [
    {
      label: "Projetos ativos",
      value: String(kpis.projetosAtivos),
      delta: "em andamento",
      href: "/projetos?situacao=em_andamento",
    },
    // Cards financeiros: apenas quando há permissão.
    ...(verFin
      ? [
          {
            label: "Receita prevista",
            value: brl(kpis.receitaPrevista),
            delta: "contas a receber em aberto",
            href: "/financeiro",
          },
        ]
      : []),
    {
      label: "Entregas pendentes",
      value: String(kpis.entregasPendentes),
      delta: "disciplinas com prazo em 7 dias ou vencido",
      href: "/projetos",
    },
    ...(verFin && agingReceita
      ? [
          {
            label: "Contas vencidas",
            value: brl(agingReceita.totalVencido),
            delta: "receitas a receber em atraso",
            href: "/financeiro#aging",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <HeroCard nome={user.name} aniversariantes={aniversarios} humorAtual={humorHoje} />

      {/* Ações rápidas (porte da versão antiga) */}
      <div className="flex flex-wrap gap-2">
        {ACOES_RAPIDAS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="inline-flex items-center gap-2 rounded-sm border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:border-primary hover:text-primary"
          >
            <a.icon className="size-4" aria-hidden /> {a.label}
          </Link>
        ))}
      </div>

      {/* KPIs do colaborador + sparkline (Mód 1) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiSpark label="Projetos em revisão" valor={kpisMeu.emRevisao} serie={kpisMeu.serieEmRevisao} href="/projetos/meu-trabalho" />
        <KpiSpark label="Aprovados no mês" valor={kpisMeu.aprovadosMes} serie={kpisMeu.serieAprovados} href="/projetos/meu-trabalho" />
        <KpiSpark label="Validações pendentes" valor={kpisMeu.validacoesPendentes} serie={kpisMeu.serieValidacoes} href="/projetos/meu-trabalho" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((kpi) => (
          <Link key={kpi.label} href={kpi.href}>
            <Card className="h-full transition-colors hover:bg-muted/40">
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
          </Link>
        ))}
      </div>

      <div className={verFin ? "grid gap-4 lg:grid-cols-[1fr_1.4fr]" : "grid gap-4"}>
        {verFin && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Receita — 6 meses</CardTitle>
              <CardDescription>Realizado (caixa) × previsto (a receber).</CardDescription>
            </CardHeader>
            <CardContent>
              <ReceitaChart dados={receita} />
            </CardContent>
          </Card>
        )}

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

      {isGlobal && carteira.length > 0 && (
        <CarteiraDashboard projetos={carteira} />
      )}

      {snapshots.length >= 2 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolução — projetos ativos</CardTitle>
            <CardDescription>Série histórica (snapshot diário dos KPIs).</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendLine
              descricao="Evolução de projetos ativos por dia"
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
