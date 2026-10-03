"use client";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { useMemo, useState } from "react";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { KpiCard } from "@/components/ui/kpi-card";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { itensDoMesDeEvolucao } from "@/modules/financeiro/relatorios/acoes";
import type { DiasDeCaixa } from "@/modules/financeiro/liquidez/indicadores";
import type { IndicadoresGerenciais, MesEvolucao } from "@/modules/financeiro/relatorios/queries";
import { brl } from "@/lib/utils";

function pct(v: number | null): string {
  return v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
function pctSinal(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`;
}
function dias(v: number | null): string {
  return v == null ? "—" : `${v} ${v === 1 ? "dia" : "dias"}`;
}
function textoDiasDeCaixa(d: DiasDeCaixa): string {
  if (d.tipo === "zero") return "R$ 0";
  if (d.tipo === "indisponivel") return "—";
  return `${d.dias}${d.maisDe365 ? "+" : ""} dias`;
}
function subDiasDeCaixa(d: DiasDeCaixa): string | undefined {
  if (d.tipo === "zero") return "sem caixa disponível";
  if (d.tipo === "indisponivel") return d.motivo;
  return undefined;
}

/**
 * Indicadores (M6, mock "Indicadores"): os 8 cartões do mês + a evolução de 6 meses (gráfico de barras e
 * tabela, cada linha com menu de contexto — ADR-0002). "Comparar com [mês]" destaca duas linhas e mostra a
 * diferença entre elas, sem navegar — os dois meses já estão na mesma tabela.
 */
export function IndicadoresView({
  ind,
  evolucao,
  mesRotulo,
  subnav,
}: {
  ind: IndicadoresGerenciais;
  evolucao: MesEvolucao[];
  /** Rótulo do mês em avaliação (o último da série de evolução). */
  mesRotulo: string;
  subnav?: React.ReactNode;
}) {
  const [comparado, setComparado] = useState<number | null>(null);
  const mesAtualIdx = evolucao.length - 1;

  const maior = Math.max(1, ...evolucao.map((m) => Math.max(m.receita, m.despesa)));
  const alturaBarra = (v: number) => Math.max(2, Math.round((v / maior) * 100));

  const diferenca = useMemo(() => {
    if (comparado == null) return null;
    const a = evolucao[mesAtualIdx];
    const b = evolucao[comparado];
    return { receita: a.receita - b.receita, despesa: a.despesa - b.despesa, resultado: a.resultado - b.resultado };
  }, [comparado, evolucao, mesAtualIdx]);

  function aoSelecionar(i: number, item: AcaoItemAcao) {
    if (item.id === "comparar-mes") setComparado((c) => (c === i ? null : i));
  }

  return (
    <div className="space-y-5">
      <CabecalhoPagina titulo="Indicadores" descricao={`Margem, prazos, inadimplência e mais — ${mesRotulo}.`} />
      {subnav}

      <section aria-label="Indicadores do mês" className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-3">
        <KpiCard
          variante="indicador"
          label="Margem líquida"
          valor={pct(ind.margemLiquida)}
          detalhe={ind.margemDeltaPontos != null ? `${pctSinal(ind.margemDeltaPontos)} sobre o período anterior` : undefined}
        />
        <KpiCard variante="indicador" label="Resultado operacional" valor={brl(ind.resultadoOperacional)} detalhe="receitas − despesas, fora distribuição de lucros" />
        <KpiCard variante="indicador" label="Dias de caixa" valor={textoDiasDeCaixa(ind.diasDeCaixa)} detalhe={subDiasDeCaixa(ind.diasDeCaixa)} />
        <KpiCard variante="indicador" label="Inadimplência (12 meses)" valor={pct(ind.inadimplencia12Meses)} detalhe="vencido há mais de 30 dias ÷ faturado" />
        <KpiCard variante="indicador" label="Prazo médio de recebimento" valor={dias(ind.prazoMedioRecebimento)} detalhe="da emissão ao recebimento" />
        <KpiCard variante="indicador" label="Prazo médio de pagamento" valor={dias(ind.prazoMedioPagamento)} detalhe="do lançamento ao pagamento" />
        <KpiCard variante="indicador" label="Ponto de equilíbrio" valor={brl(ind.pontoDeEquilibrio)} detalhe="despesas do mês (sem separar custo fixo e variável)" />
        <KpiCard
          variante="indicador"
          label="Receita por projeto ativo"
          valor={ind.receitaPorProjetoAtivo == null ? "—" : brl(ind.receitaPorProjetoAtivo)}
          detalhe={`${ind.projetosAtivos} ${ind.projetosAtivos === 1 ? "projeto em andamento" : "projetos em andamento"}`}
        />
      </section>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">
              Receita × despesa, últimos {evolucao.length} meses
            </h2>
            <span className="text-xs text-muted-foreground">R$ mil</span>
          </div>

          <div
            role="img"
            aria-label={`Receita e despesa de ${evolucao.map((m) => `${m.rotulo} ${brl(m.receita)} e ${brl(m.despesa)}`).join(", ")}`}
            className="grid items-end gap-3"
            style={{ gridTemplateColumns: `repeat(${evolucao.length}, minmax(0, 1fr))`, height: 180 }}
          >
            {evolucao.map((m, i) => (
              <div key={m.rotulo + i} className="flex h-full items-end justify-center gap-1">
                <div className={`w-3.5 rounded-t-sm ${i === comparado || (comparado == null && i === mesAtualIdx) ? "bg-primary" : "bg-primary/60"}`} style={{ height: `${alturaBarra(m.receita)}%` }} title={`Receita ${brl(m.receita)}`} />
                <div className="w-3.5 rounded-t-sm bg-warning/70" style={{ height: `${alturaBarra(m.despesa)}%` }} title={`Despesa ${brl(m.despesa)}`} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm bg-primary/60" /> Receita
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm bg-warning/70" /> Despesa
            </span>
            <span>Cada barra também está na tabela abaixo.</span>
          </div>

          {diferenca && comparado != null && (
            <p className="rounded-sm border bg-muted/30 px-3 py-2 text-[13px]" aria-live="polite">
              <b>
                {evolucao[mesAtualIdx].rotulo} vs {evolucao[comparado].rotulo}:
              </b>{" "}
              receita {diferenca.receita >= 0 ? "+" : ""}
              {brl(diferenca.receita)}, despesa {diferenca.despesa >= 0 ? "+" : ""}
              {brl(diferenca.despesa)}, resultado {diferenca.resultado >= 0 ? "+" : ""}
              {brl(diferenca.resultado)}.{" "}
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setComparado(null)}>
                Limpar comparação
              </Button>
            </p>
          )}

          <DicaMenuContexto />
          {/* `relative`: o `sr-only` da última coluna é absoluto e, sem ancestral posicionado, escaparia da rolagem. */}
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                  <th className="py-2 pr-3">Mês</th>
                  <th className="py-2 pr-3 text-right">Receita</th>
                  <th className="py-2 pr-3 text-right">Despesa</th>
                  <th className="py-2 pr-3 text-right">Resultado</th>
                  <th className="py-2 pr-3 text-right">Margem</th>
                  <th className="w-10 py-2">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {evolucao.map((m, i) => {
                  const itens = itensDoMesDeEvolucao({ rotulo: evolucao[mesAtualIdx].rotulo, de: m.de, ate: m.ate, ehAtual: i === mesAtualIdx });
                  const destaque = i === mesAtualIdx || i === comparado;
                  return (
                    <LinhaComMenu
                      key={m.rotulo + i}
                      itens={itens}
                      onSelect={(item) => aoSelecionar(i, item)}
                      render={<tr className={`border-b last:border-0 hover:bg-muted/20 data-[popup-open]:bg-muted/30 ${destaque ? "bg-muted/30" : ""}`} />}
                    >
                      <td className="py-2 pr-3">{i === mesAtualIdx ? <b>{m.rotulo}</b> : m.rotulo}</td>
                      <td className="py-2 pr-3 text-right font-mono">{brl(m.receita)}</td>
                      <td className="py-2 pr-3 text-right font-mono">{brl(m.despesa)}</td>
                      <td className={`py-2 pr-3 text-right font-mono ${m.resultado >= 0 ? "text-success" : "text-destructive"}`}>{brl(m.resultado)}</td>
                      <td className="py-2 pr-3 text-right font-mono">{pct(m.margem)}</td>
                      <td className="py-2">
                        <BotaoAcoes itens={itens} onSelect={(item) => aoSelecionar(i, item)} rotulo={`Ações de ${m.rotulo}`} className="size-8" />
                      </td>
                    </LinhaComMenu>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
