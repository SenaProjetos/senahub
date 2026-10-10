import type { Metadata } from "next";
import { utcInicioDoDia, utcFimDoDia } from "@/lib/data";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, Paperclip, BookOpenText } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { meuExtrato } from "@/modules/financeiro/queries";
import { recibosDoProjetista } from "@/modules/financeiro/recibo/queries";
import { MeusRecibos } from "@/components/financeiro/recibo/meus-recibos";

import { agingReport } from "@/modules/financeiro/aging/queries";
import { relatorioDRE, serieMensalResultado, despesasPorCategoria } from "@/modules/financeiro/relatorios/queries";
import { fluxoCaixa } from "@/modules/financeiro/caixa/queries";
import { distribuidoAosSocios } from "@/modules/financeiro/socios/queries";
import { torreDeControle } from "@/modules/financeiro/liquidez/queries";
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
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { TorreLiquidez } from "@/components/financeiro/liquidez/torre-liquidez";
import { Valor } from "@/components/financeiro/valor";
import { brl, formatarData } from "@/lib/utils";
import { ehPrestador } from "@/lib/contratacao";

export const metadata: Metadata = { title: "Financeiro" };


/** Intervalo [de, ate] e rótulo do período selecionado no dashboard. Default = mês corrente. */
function intervaloPeriodo(periodo: Periodo, hoje = new Date()) {
  const ano = hoje.getFullYear();
  if (periodo === "ano") {
    return {
      de: utcInicioDoDia(ano, 0),
      ate: utcFimDoDia(ano, 11, 31),
      rotulo: String(ano),
    };
  }
  if (periodo === "trimestre") {
    const triIni = Math.floor(hoje.getMonth() / 3) * 3;
    return {
      de: utcInicioDoDia(ano, triIni),
      ate: utcFimDoDia(ano, triIni + 3, 0),
      rotulo: `${Math.floor(triIni / 3) + 1}º tri · ${ano}`,
    };
  }
  // mês corrente (default)
  return {
    de: utcInicioDoDia(ano, hoje.getMonth()),
    ate: utcFimDoDia(ano, hoje.getMonth() + 1, 0),
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
  const mostrarGuia = user.tipo === "interno";
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
    const [receber, pagar, dreMes, serie, despesas, caixa, distribuido] = await Promise.all([
      agingReport("receita"),
      agingReport("despesa"),
      relatorioDRE(inicioMes, fimMes),
      serieMensalResultado(hoje.getFullYear()),
      despesasPorCategoria(inicioMes, fimMes),
      fluxoCaixa(),
      distribuidoAosSocios(inicioMes, fimMes),
    ]);
    // Torre de controle: o MESMO motor do planejador (F7). A Visão geral não tem mais conta
    // própria de projeção — duas contas para o mesmo caixa era o risco nº 1 do plano.
    const torre = await torreDeControle();
    const margem = dreMes.totalReceitas > 0 ? Math.round((dreMes.resultado / dreMes.totalReceitas) * 100) : null;
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
            </>
          }
        />
        <NavFinanceiro />

        <TorreLiquidez torre={torre} contas={caixa.contas} />

        {/* Daqui para baixo é o RESULTADO (o que já aconteceu), e só isto obedece ao período — por isso
            o seletor mora aqui, e não no cabeçalho, onde parecia mudar o caixa lá de cima. */}
        <section aria-labelledby="resultado-t" className="space-y-4 border-t pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="resultado-t" className="text-[15px] font-bold">
              Resultado de {mesRotulo}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <PeriodoSelector periodo={periodo} />
              <Button variant="outline" size="sm" render={<Link href="/financeiro/relatorios" />}>
                Abrir DRE
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="grid gap-x-6 gap-y-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[13px] text-muted-foreground">Receitas</p>
                <Valor valor={dreMes.totalReceitas} className="text-xl font-semibold" />
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground">Despesas</p>
                <Valor valor={-dreMes.totalDespesas} className="text-xl font-semibold" />
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground">Resultado</p>
                <Valor valor={dreMes.resultado} className="text-xl font-semibold" />
                <p className="text-[12px] text-muted-foreground">
                  {margem == null ? "sem receita no período" : `${margem}% da receita`}
                </p>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground">Distribuído aos sócios</p>
                <Valor valor={-distribuido} sentido="neutro" className="text-xl font-semibold" />
                <p className="text-[12px] text-muted-foreground">fora do resultado, só no caixa</p>
              </div>
            </CardContent>
          </Card>

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

        </section>

        <section id="aging" className="scroll-mt-24">
          <AgingWidget receber={receber} pagar={pagar} />
        </section>
      </div>
    );
  }

  // Sem visão completa → extrato próprio (projetista/freelancer/cliente).
  const podeExtrato = await can(user, "financeiro", "extrato");
  if (!podeExtrato) redirect("/sem-permissao");

  const { pagamentos, total, pago, aberto } = await meuExtrato(user.id);
  // G5/D36: recibos do próprio projetista — assinar, baixar PDF e (PJ) anexar a NF.
  const recibos = await recibosDoProjetista(user.id);
  const ehPJ = ehPrestador(user.contratacao);

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
