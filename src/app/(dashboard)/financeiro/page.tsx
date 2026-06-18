import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings2, Receipt, BarChart3, Banknote, LineChart, ArrowLeftRight, Target, Activity, Scale, FileText, Upload, SlidersHorizontal, CalendarClock, TrendingUp } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { meuExtrato } from "@/modules/financeiro/queries";
import { agingReport } from "@/modules/financeiro/aging/queries";
import { totalAguardando } from "@/modules/financeiro/aprovacao/queries";
import { relatorioDRE, serieMensalResultado, despesasPorCategoria } from "@/modules/financeiro/relatorios/queries";
import { fluxoCaixa, projecaoCaixa } from "@/modules/financeiro/caixa/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { AgingWidget } from "@/components/financeiro/aging-widget";
import { ResultadoMensalChart } from "@/components/financeiro/resultado-mensal-chart";
import { CategoriaDonutChart } from "@/components/financeiro/categoria-donut-chart";
import { FluxoProjecaoChart } from "@/components/financeiro/fluxo-projecao-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Financeiro" };

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const ATALHOS = [
  { href: "/financeiro/lancamentos", icon: Receipt, titulo: "Lançamentos", desc: "Receitas e despesas" },
  { href: "/financeiro/contas", icon: ArrowLeftRight, titulo: "Contas a pagar e receber", desc: "Pendentes, filtros e exportação" },
  { href: "/financeiro/folha-projetistas", icon: Banknote, titulo: "Folha de projetistas", desc: "Pagamentos por entrega" },
  { href: "/financeiro/fluxo-caixa", icon: LineChart, titulo: "Fluxo de caixa", desc: "Saldos e movimentos" },
  { href: "/financeiro/conciliacao", icon: ArrowLeftRight, titulo: "Conciliação", desc: "Importar OFX e conciliar" },
  { href: "/financeiro/relatorios", icon: BarChart3, titulo: "Relatórios", desc: "DRE e indicadores" },
  { href: "/financeiro/rentabilidade", icon: TrendingUp, titulo: "Rentabilidade", desc: "DRE e margem por projeto" },
  { href: "/financeiro/dfc", icon: Activity, titulo: "DFC", desc: "Fluxo de caixa por atividade" },
  { href: "/financeiro/balanco", icon: Scale, titulo: "Balanço gerencial", desc: "Ativo, passivo e PL (base caixa)" },
  { href: "/financeiro/orcamento", icon: Target, titulo: "Orçamento anual", desc: "Planejado × realizado por categoria" },
  { href: "/financeiro/documentos", icon: FileText, titulo: "Documentos", desc: "NF, contratos e parcelamento" },
  { href: "/financeiro/cadastros", icon: Settings2, titulo: "Cadastros", desc: "Plano de contas, contas, fornecedores" },
];

export default async function FinanceiroPage() {
  const user = await requireUser();
  const podeVer = await can(user.role, "financeiro", "ver");

  if (podeVer) {
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);
    const [receber, pagar, aguardando, podeGerir, dreMes, serie, despesas, caixa] = await Promise.all([
      agingReport("receita"),
      agingReport("despesa"),
      totalAguardando(),
      can(user.role, "financeiro", "gerir"),
      relatorioDRE(inicioMes, fimMes),
      serieMensalResultado(hoje.getFullYear()),
      despesasPorCategoria(inicioMes, fimMes),
      fluxoCaixa(),
    ]);
    const projecao = await projecaoCaixa(caixa.saldoTotal);
    const vencidoTotal = receber.totalVencido + pagar.totalVencido;
    const mesRotulo = hoje.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const atalhos = podeGerir
      ? [
          ...ATALHOS,
          { href: "/financeiro/planejamento", icon: CalendarClock, titulo: "Planejamento de pagamentos", desc: "Mesa de planejamento do caixa" },
          { href: "/financeiro/importar", icon: Upload, titulo: "Importar dados", desc: "Migrar planilha do Meu Dinheiro" },
          { href: "/financeiro/configuracoes", icon: SlidersHorizontal, titulo: "Configurações", desc: "Campos obrigatórios e regras" },
        ]
      : ATALHOS;
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Financeiro</h2>
          <p className="text-sm text-muted-foreground">Visão geral · {mesRotulo}.</p>
        </div>

        {vencidoTotal > 0 && (
          <Link href="/financeiro/contas">
            <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm transition-colors hover:bg-destructive/10">
              <AlertTriangle className="size-5 shrink-0 text-destructive" />
              <span className="flex-1">
                <span className="font-semibold text-destructive">{brl(vencidoTotal)}</span> em contas vencidas
                {pagar.totalVencido > 0 && ` · ${brl(pagar.totalVencido)} a pagar`}
                {receber.totalVencido > 0 && ` · ${brl(receber.totalVencido)} a receber`}.
              </span>
              <span className="text-xs text-muted-foreground">Ver contas →</span>
            </div>
          </Link>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard titulo="Receita do mês" valor={dreMes.totalReceitas} tom="success" />
          <KpiCard titulo="Despesa do mês" valor={dreMes.totalDespesas} tom="destructive" />
          <KpiCard titulo="Resultado do mês" valor={dreMes.resultado} colorido />
          <KpiCard titulo="Saldo em caixa" valor={caixa.saldoTotal} colorido />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resultado mensal — {hoje.getFullYear()}</CardTitle>
              <CardDescription>Receita − despesa realizadas por mês.</CardDescription>
            </CardHeader>
            <CardContent>
              <ResultadoMensalChart dados={serie} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Despesas por categoria</CardTitle>
              <CardDescription>Confirmadas em {mesRotulo} · total {brl(despesas.total)}.</CardDescription>
            </CardHeader>
            <CardContent>
              <CategoriaDonutChart dados={despesas.fatias} total={despesas.total} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Projeção de caixa</CardTitle>
            <CardDescription>Saldos por conta e projeção das próximas semanas.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <ul className="space-y-1 text-sm">
              {caixa.contas.length === 0 ? (
                <li className="text-muted-foreground">Nenhuma conta cadastrada.</li>
              ) : (
                caixa.contas.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{c.nome}</span>
                    <span className={`font-mono text-xs ${c.saldo < 0 ? "text-destructive" : ""}`}>{brl(c.saldo)}</span>
                  </li>
                ))
              )}
              <li className="flex items-center justify-between gap-2 border-t pt-1 font-semibold">
                <span>Total</span>
                <span className={`font-mono text-xs ${caixa.saldoTotal < 0 ? "text-destructive" : ""}`}>{brl(caixa.saldoTotal)}</span>
              </li>
            </ul>
            <FluxoProjecaoChart dados={projecao} saldoInicial={caixa.saldoTotal} />
          </CardContent>
        </Card>

        <AgingWidget receber={receber} pagar={pagar} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/financeiro/aprovacoes">
            <Card className={`h-full transition-colors hover:border-primary/50 ${aguardando > 0 ? "border-warning/50" : ""}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <ShieldCheck className="size-5 text-primary" />
                  {aguardando > 0 && <Badge variant="outline" className="border-warning/40 text-warning">{aguardando}</Badge>}
                </div>
                <CardTitle className="text-base">Aprovações</CardTitle>
                <CardDescription>Despesas aguardando alçada</CardDescription>
              </CardHeader>
            </Card>
          </Link>
          {atalhos.map((a) => (
            <Link key={a.href} href={a.href}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <a.icon className="size-5 text-primary" />
                  <CardTitle className="text-base">{a.titulo}</CardTitle>
                  <CardDescription>{a.desc}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // Sem visão completa → extrato próprio (projetista/freelancer/cliente).
  const podeExtrato = await can(user.role, "financeiro", "extrato");
  if (!podeExtrato) redirect("/sem-permissao");

  const { pagamentos, total, pago, aberto } = await meuExtrato(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Meu extrato</h2>
        <p className="text-sm text-muted-foreground">Seus pagamentos por entregas validadas.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Total</CardDescription>
            <CardTitle className="text-2xl">{brl(total)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Recebido</CardDescription>
            <CardTitle className="text-2xl text-success">{brl(pago)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Em aberto</CardDescription>
            <CardTitle className="text-2xl text-warning">{brl(aberto)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pagamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {pagamentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pagamento ainda.</p>
          ) : (
            <ul className="divide-y text-sm">
              {pagamentos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="font-medium">{p.disciplina.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatarCodigo(p.disciplina.projeto.codigo)} · {p.disciplina.projeto.nome}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono">{brl(Number(p.valor))}</span>
                    <Badge
                      variant="outline"
                      className={
                        p.status === "pago"
                          ? "text-success border-success/40"
                          : p.status === "pendente"
                            ? "text-warning border-warning/40"
                            : ""
                      }
                    >
                      {p.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  titulo,
  valor,
  tom,
  colorido = false,
}: {
  titulo: string;
  valor: number;
  tom?: "success" | "destructive" | "warning";
  colorido?: boolean;
}) {
  const TONS = { success: "text-success", destructive: "text-destructive", warning: "text-warning" } as const;
  const cor = tom ? TONS[tom] : colorido ? (valor < 0 ? "text-destructive" : "text-success") : "";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">{titulo}</CardDescription>
        <CardTitle className={`text-2xl ${cor}`}>{brl(valor)}</CardTitle>
      </CardHeader>
    </Card>
  );
}
