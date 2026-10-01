import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings2, Receipt, BarChart3, Banknote, LineChart, ArrowLeftRight, Target, Activity, Scale, FileText, Upload, SlidersHorizontal, CalendarClock, TrendingUp, CalendarCheck, Paperclip, BookOpenText } from "lucide-react";
import { requireUser } from "@/lib/session";
import { tipoEfetivo } from "@/lib/roles";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { meuExtrato } from "@/modules/financeiro/queries";
import { recibosDoProjetista } from "@/modules/financeiro/recibo/queries";
import { MeusRecibos } from "@/components/financeiro/recibo/meus-recibos";
import { PJ_ROLES } from "@/lib/roles";
import { agingReport } from "@/modules/financeiro/aging/queries";
import { totalAguardando } from "@/modules/financeiro/aprovacao/queries";
import { relatorioDRE, serieMensalResultado, despesasPorCategoria } from "@/modules/financeiro/relatorios/queries";
import { fluxoCaixa } from "@/modules/financeiro/caixa/queries";
import { torreDeControle } from "@/modules/financeiro/liquidez/queries";
import { totalTransacoesPendentes } from "@/modules/financeiro/conciliacao/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { AgingWidget } from "@/components/financeiro/aging-widget";
import { ResultadoMensalChart } from "@/components/financeiro/resultado-mensal-chart";
import { CategoriaDonutChart } from "@/components/financeiro/categoria-donut-chart";
import { PeriodoSelector, type Periodo } from "@/components/financeiro/periodo-selector";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { KpiCard } from "@/components/ui/kpi-card";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { TorreLiquidez } from "@/components/financeiro/liquidez/torre-liquidez";
import { Valor } from "@/components/financeiro/valor";
import { brl, formatarData } from "@/lib/utils";

export const metadata: Metadata = { title: "Financeiro" };

const ATALHOS = [
  { href: "/financeiro/lancamentos", icon: Receipt, titulo: "Lançamentos", desc: "Receitas e despesas" },
  { href: "/financeiro/contas", icon: ArrowLeftRight, titulo: "Contas a pagar e receber", desc: "Pendentes, filtros e exportação" },
  { href: "/financeiro/folha-projetistas", icon: Banknote, titulo: "Produção", desc: "Pagamento de projetistas PJ por entrega" },
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

/** Intervalo [de, ate] e rótulo do período selecionado no dashboard. Default = mês corrente. */
function intervaloPeriodo(periodo: Periodo, hoje = new Date()) {
  const ano = hoje.getFullYear();
  if (periodo === "ano") {
    return {
      de: new Date(ano, 0, 1),
      ate: new Date(ano, 11, 31, 23, 59, 59),
      rotulo: String(ano),
    };
  }
  if (periodo === "trimestre") {
    const triIni = Math.floor(hoje.getMonth() / 3) * 3;
    return {
      de: new Date(ano, triIni, 1),
      ate: new Date(ano, triIni + 3, 0, 23, 59, 59),
      rotulo: `${Math.floor(triIni / 3) + 1}º tri · ${ano}`,
    };
  }
  // mês corrente (default)
  return {
    de: new Date(ano, hoje.getMonth(), 1),
    ate: new Date(ano, hoje.getMonth() + 1, 0, 23, 59, 59),
    rotulo: hoje.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
  };
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const user = await requireUser();
  const podeVer = await podeVerFinanceiro(user);
  // Botão do Guia de uso: eixo interno × externo, NÃO `podeVerFinanceiro`. Quem cai no "Meu
  // extrato" por não gerir o Financeiro (projetista PJ, por exemplo) é exatamente o leitor que o
  // guia tem de alcançar — e `cliente` renderiza esta página, então o sinal também impede o par
  // "vê o link e toma 404" (ver F1-2 no plano dos Guias de uso).
  const mostrarGuia = tipoEfetivo(user.tipo, user.role) === "interno";
  const botaoGuia = mostrarGuia ? (
    <Button variant="secondary" size="sm" render={<Link href="/guias/financeiro" />}>
      <BookOpenText className="size-4" /> Guia de uso
    </Button>
  ) : null;

  if (podeVer) {
    const sp = await searchParams;
    const periodo: Periodo =
      sp.periodo === "trimestre" || sp.periodo === "ano" ? sp.periodo : "mes";
    const hoje = new Date();
    const { de: inicioMes, ate: fimMes, rotulo: mesRotulo } = intervaloPeriodo(periodo, hoje);
    const [receber, pagar, aguardando, conciliacaoPendente, podeGerir, dreMes, serie, despesas, caixa] = await Promise.all([
      agingReport("receita"),
      agingReport("despesa"),
      totalAguardando(),
      totalTransacoesPendentes(),
      can(user, "financeiro", "gerir"),
      relatorioDRE(inicioMes, fimMes),
      serieMensalResultado(hoje.getFullYear()),
      despesasPorCategoria(inicioMes, fimMes),
      fluxoCaixa(),
    ]);
    // Torre de controle: o MESMO motor do planejador (F7). A Visão geral não tem mais conta
    // própria de projeção — duas contas para o mesmo caixa era o risco nº 1 do plano.
    const torre = await torreDeControle();
    const vencidoTotal = receber.totalVencido + pagar.totalVencido;
    // Qtd de contas vencidas (todas as faixas de aging exceto "a_vencer"), receber + pagar.
    const qtdVencidas = [receber, pagar].reduce(
      (s, r) => s + r.porFaixa.filter((f) => f.faixa !== "a_vencer").reduce((a, f) => a + f.qtd, 0),
      0,
    );
    // Contagens por href dos atalhos (badge só quando > 0).
    const contagensAtalho: Record<string, number> = {
      "/financeiro/contas": qtdVencidas,
      "/financeiro/conciliacao": conciliacaoPendente,
    };
    const atalhos = podeGerir
      ? [
          ...ATALHOS,
          { href: "/financeiro/planejamento", icon: CalendarClock, titulo: "Pagamentos em lote", desc: "Escolher quais contas a pagar cabem no caixa" },
          { href: "/financeiro/fechamento", icon: CalendarCheck, titulo: "Fechamento mensal", desc: "Consolidação e retenções do mês" },
          { href: "/financeiro/importar", icon: Upload, titulo: "Importar dados", desc: "Migrar planilha do Meu Dinheiro" },
          { href: "/financeiro/configuracoes", icon: SlidersHorizontal, titulo: "Configurações", desc: "Campos obrigatórios e regras" },
        ]
      : ATALHOS;
    return (
      <div className="space-y-6">
        <CabecalhoPagina
          titulo="Financeiro"
          descricao="Como está o caixa hoje e para onde ele vai no horizonte do planejador."
          acoes={
            <>
              <Button size="sm" render={<Link href="/financeiro/planejador" />}>
                Abrir planejador
              </Button>
              {botaoGuia}
              <PeriodoSelector periodo={periodo} />
            </>
          }
        />
        <NavFinanceiro />

        {vencidoTotal > 0 && (
          <Link href="/financeiro/contas" className="block">
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

        <TorreLiquidez torre={torre} contas={caixa.contas} />

        <h2 className="pt-2 text-[15px] font-bold">Resultado de {mesRotulo}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          <KpiCard variante="indicador" label="Receita do período" valor={<Valor valor={dreMes.totalReceitas} />} detalhe={mesRotulo} />
          <KpiCard variante="indicador" label="Despesa do período" valor={<Valor valor={-dreMes.totalDespesas} />} detalhe={mesRotulo} />
          <KpiCard variante="indicador" label="Resultado do período" valor={<Valor valor={dreMes.resultado} />} detalhe="receita menos despesa realizadas" />
          <KpiCard variante="indicador" label="Caixa atual" valor={<Valor valor={caixa.saldoTotal} sentido="neutro" />} detalhe="saldo das contas ativas" />
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
              <CardTitle className="text-base">Despesas por subcategoria</CardTitle>
              <CardDescription>Confirmadas em {mesRotulo} · total {brl(despesas.total)}.</CardDescription>
            </CardHeader>
            <CardContent>
              <CategoriaDonutChart dados={despesas.fatias} total={despesas.total} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">DRE do período</CardTitle>
            <CardDescription>Lançamentos confirmados · {mesRotulo}.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              <div className="flex items-center justify-between py-2">
                <dt className="text-muted-foreground">Receitas</dt>
                <dd><Valor valor={dreMes.totalReceitas} /></dd>
              </div>
              <div className="flex items-center justify-between py-2">
                <dt className="text-muted-foreground">(−) Despesas</dt>
                <dd><Valor valor={-dreMes.totalDespesas} /></dd>
              </div>
              <div className="flex items-center justify-between py-2 font-semibold">
                <dt>(=) Resultado</dt>
                <dd><Valor valor={dreMes.resultado} /></dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <section id="aging" className="scroll-mt-24">
          <AgingWidget receber={receber} pagar={pagar} />
        </section>
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
          {atalhos.map((a) => {
            const count = contagensAtalho[a.href] ?? 0;
            return (
              <Link key={a.href} href={a.href}>
                <Card className={`h-full transition-colors hover:border-primary/50 ${count > 0 ? "border-warning/50" : ""}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <a.icon className="size-5 text-primary" />
                      {count > 0 && <Badge variant="outline" className="border-warning/40 text-warning">{count}</Badge>}
                    </div>
                    <CardTitle className="text-base">{a.titulo}</CardTitle>
                    <CardDescription>{a.desc}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // Sem visão completa → extrato próprio (projetista/freelancer/cliente).
  const podeExtrato = await can(user, "financeiro", "extrato");
  if (!podeExtrato) redirect("/sem-permissao");

  const { pagamentos, total, pago, aberto } = await meuExtrato(user.id);
  // G5/D36: recibos do próprio projetista — assinar, baixar PDF e (PJ) anexar a NF.
  const recibos = await recibosDoProjetista(user.id);
  const ehPJ = PJ_ROLES.includes(user.role as (typeof PJ_ROLES)[number]);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Meu extrato"
        descricao="Seus pagamentos por entregas validadas"
        acoes={botaoGuia}
      />

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

      <MeusRecibos recibos={recibos} podeEnviarNf={ehPJ} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pagamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {pagamentos.length === 0 ? (
            <EmptyState icon={Banknote} title="Nenhum pagamento ainda." />
          ) : (
            <ul className="divide-y text-sm">
              {pagamentos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="font-medium">{p.rotuloDisciplina}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatarCodigo(p.disciplina.projeto.codigo)} · {p.disciplina.projeto.nome}
                    </p>
                    {/* D35: forma de pagamento, sem a conta — o projetista não vê de qual
                        conta bancária da empresa saiu. */}
                    {p.status === "pago" && (
                      <p className="text-xs text-muted-foreground">
                        Pago em {formatarData(p.pagoEm)}
                        {p.forma ? ` · ${p.forma}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono">{brl(p.valor)}</span>
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
                  {p.anexos.length > 0 && (
                    <div className="flex w-full flex-wrap items-center gap-2">
                      {/* "Anexos", não "comprovantes": são todo `LancamentoAnexo` do
                          lançamento — quem tem `financeiro:gerir` pode ter anexado algo ali
                          que não é o comprovante do pagamento em si (mesma ressalva de
                          `CelulaPagamento`, D26). O rótulo não promete mais do que o dado garante. */}
                      <span className="text-xs text-muted-foreground">Anexos deste pagamento:</span>
                      {p.anexos.map((c) => (
                        <a
                          key={c.id}
                          href={`/api/financeiro/folha-projetistas/comprovante/${c.id}`}
                          className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                        >
                          <Paperclip className="size-3" aria-hidden />
                          {c.nome}
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
