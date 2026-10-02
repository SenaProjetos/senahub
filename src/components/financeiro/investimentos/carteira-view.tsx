"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Landmark, Plus } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Progress } from "@/components/ui/progress";
import { brl, formatarData } from "@/lib/utils";
import { itensDoAtivo } from "@/modules/financeiro/investimentos/acoes";
import { liquidezImediata, ROTULO_LIQUIDEZ } from "@/modules/financeiro/investimentos/calculo";
import type { AtivoDto } from "@/modules/financeiro/investimentos/queries";
import { ROTULO_TIPO } from "./dialogos";
import { useAcoesAtivo } from "./use-acoes-ativo";

const reais = (c: number) => brl(c / 100);
const mesAno = (d: string | null) => (d ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : "sem prazo");

/**
 * Carteira de investimentos (mock "Investimentos — carteira"): KPIs, lista de ativos com menu de contexto e `...`
 * (ADR-0002), por liquidez e próximos vencimentos. Cada ativo é uma conta própria fora do caixa.
 */
export function CarteiraView({ ativos, contas, podeGerir, subnav }: { ativos: AtivoDto[]; contas: { id: string; nome: string }[]; podeGerir: boolean; subnav?: React.ReactNode }) {
  const [aba, setAba] = useState<"ativos" | "resgatados">("ativos");
  const acoes = useAcoesAtivo(contas);
  const carteira = ativos.filter((a) => !a.arquivado);
  const lista = aba === "ativos" ? carteira : ativos.filter((a) => a.arquivado);

  const k = useMemo(() => {
    const aplicado = carteira.reduce((s, a) => s + a.posicao.aplicado, 0);
    const atual = carteira.reduce((s, a) => s + a.posicao.valorAtual, 0);
    const imediato = carteira.filter((a) => liquidezImediata(a.liquidez)).reduce((s, a) => s + a.posicao.valorAtual, 0);
    return { aplicado, atual, rendimento: atual - aplicado, imediato };
  }, [carteira]);

  const vencimentos = carteira
    .filter((a) => a.vencimento)
    .sort((a, b) => (a.vencimento! < b.vencimento! ? -1 : 1))
    .slice(0, 4);

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Investimentos"
        descricao="Carteira por ativo: o valor atual fica fora do caixa até o resgate."
        acoes={
          podeGerir ? (
            <Button size="sm" onClick={acoes.novo}>
              <Plus className="size-4" aria-hidden /> Novo investimento
            </Button>
          ) : undefined
        }
      />
      {subnav}

      {ativos.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nenhum investimento cadastrado."
          description="Cadastre o CDB, a LCI, o Tesouro ou o fundo da empresa: o aporte sai da conta corrente e o rendimento entra na DRE."
          action={podeGerir ? <Button size="sm" onClick={acoes.novo}>Novo investimento</Button> : undefined}
        />
      ) : (
        <>
          <section aria-label="Resumo da carteira" className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
            <KpiCard variante="indicador" label="Total aplicado" valor={reais(k.aplicado)} detalhe={`${carteira.length} ${carteira.length === 1 ? "ativo" : "ativos"}`} />
            <KpiCard variante="indicador" label="Valor atual" valor={reais(k.atual)} detalhe="líquido do IR provisionado" />
            <KpiCard
              variante="indicador"
              label="Rendimento"
              valor={`${k.rendimento >= 0 ? "+ " : "− "}${reais(Math.abs(k.rendimento))}`}
              detalhe={k.aplicado > 0 ? `${((k.rendimento / k.aplicado) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% sobre o aplicado, líquido` : undefined}
            />
            <KpiCard variante="indicador" label="Disponível em até 1 dia" valor={reais(k.imediato)} detalhe="liquidez D+0 e 1 dia útil" />
          </section>

          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section aria-label="Ativos da carteira" className="overflow-hidden rounded-sm border bg-card shadow-[var(--card-shadow)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="text-base font-bold">Ativos</h2>
                <div role="group" aria-label="Situação" className="flex gap-1">
                  {(["ativos", "resgatados"] as const).map((v) => (
                    <Button key={v} size="sm" variant={aba === v ? "default" : "outline"} onClick={() => setAba(v)} aria-pressed={aba === v}>
                      {v === "ativos" ? "Ativos" : "Resgatados"}
                    </Button>
                  ))}
                </div>
              </div>
              {lista.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">{aba === "ativos" ? "Nenhum ativo na carteira." : "Nenhum ativo resgatado."}</p>
              ) : (
                /* `relative`: o `sr-only` da última coluna é absoluto e, sem ancestral posicionado, escaparia da rolagem. */
                <div className="relative overflow-x-auto">
                  <DicaMenuContexto className="px-2" />
                  <table className="w-full min-w-[52rem] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                        <th className="min-w-[16rem] px-4 py-2">Ativo</th>
                        <th className="px-4 py-2">Vence</th>
                        <th className="px-4 py-2">Liquidez</th>
                        <th className="px-4 py-2 text-right">Aplicado</th>
                        <th className="px-4 py-2 text-right">Atual</th>
                        <th className="px-4 py-2 text-right">Rendimento</th>
                        <th className="w-12 px-2 py-2">
                          <span className="sr-only">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>{lista.map((a) => renderAtivo(a))}</tbody>
                    {aba === "ativos" && (
                      <tfoot>
                        <tr className="border-t font-bold">
                          <td className="px-4 py-2">Total</td>
                          <td className="px-4 py-2" colSpan={2} />
                          <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{reais(k.aplicado)}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{reais(k.atual)}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{`${k.rendimento >= 0 ? "+ " : "− "}${reais(Math.abs(k.rendimento))}`}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </section>

            <aside className="grid gap-4">
              <section aria-label="Por liquidez" className="rounded-sm border bg-card p-4 shadow-[var(--card-shadow)]">
                <h2 className="mb-3 text-base font-bold">Por liquidez</h2>
                {(() => {
                  const imediato = k.imediato;
                  const resto = k.atual - imediato;
                  const pct = (v: number) => (k.atual > 0 ? Math.round((v / k.atual) * 100) : 0);
                  return (
                    <div className="grid gap-3 text-sm">
                      {[
                        ["Até 1 dia", imediato],
                        ["No vencimento e outras", resto],
                      ].map(([rotulo, v]) => (
                        <div key={rotulo as string} className="grid gap-1">
                          <div className="flex justify-between gap-2">
                            <span>{rotulo}</span>
                            <span className="whitespace-nowrap font-mono">
                              {reais(v as number)} · {pct(v as number)}%
                            </span>
                          </div>
                          <Progress valor={pct(v as number)} rotulo={`${rotulo}: ${pct(v as number)}%`} />
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </section>
              <section aria-label="Próximos vencimentos" className="rounded-sm border bg-card p-4 shadow-[var(--card-shadow)]">
                <h2 className="mb-3 text-base font-bold">Próximos vencimentos</h2>
                {vencimentos.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">Nenhum ativo com vencimento.</p>
                ) : (
                  <ul className="grid gap-2 text-sm">
                    {vencimentos.map((a) => (
                      <li key={a.id} className="flex justify-between gap-2">
                        <span className="min-w-0">
                          <Link href={`/financeiro/investimentos/${a.id}`} className="font-medium hover:underline">
                            {a.nome}
                          </Link>
                          <span className="block text-xs text-muted-foreground">vence em {formatarData(a.vencimento!)}</span>
                        </span>
                        <span className="shrink-0 whitespace-nowrap font-mono">{reais(a.posicao.valorAtual)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">No planejador, o vencimento de aplicação entra como entrada prevista na data, não como saldo livre antes dela.</p>
              </section>
            </aside>
          </div>
        </>
      )}

      <p className="text-[12.5px] text-muted-foreground">
        Aporte e resgate são transferências entre a conta e o ativo: movem o saldo da conta, mas ficam fora do resultado. Só o rendimento é receita, e o IR é
        despesa.
      </p>
      {acoes.dialogos}
    </div>
  );

  // Função de renderização, NÃO componente: um componente definido aqui dentro remontaria as linhas e fecharia o
  // menu de contexto aberto (ADR-0002).
  function renderAtivo(a: AtivoDto) {
    const itens = itensDoAtivo({ id: a.id, nome: a.nome, arquivado: a.arquivado, valorAtual: a.posicao.valorAtual, movimentos: a.movimentos }, { podeGerir });
    const aoEscolher = (item: AcaoItemAcao) => void acoes.tratar(a, item);
    const r = a.posicao.rendimentoLiquido;
    return (
      <LinhaComMenu key={a.id} itens={itens} onSelect={aoEscolher} render={<tr className="border-b last:border-0 hover:bg-muted/20 data-[popup-open]:bg-muted/30" />}>
        <td className="px-4 py-2">
          <Link href={`/financeiro/investimentos/${a.id}`} className="font-medium hover:underline">
            {a.nome}
          </Link>
          <span className="block text-xs text-muted-foreground">
            {[ROTULO_TIPO[a.tipo], a.instituicao, a.indexador, a.isentoIR ? "isento de IR" : null].filter(Boolean).join(" · ")}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{mesAno(a.vencimento)}</td>
        <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{ROTULO_LIQUIDEZ[a.liquidez]}</td>
        <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{reais(a.posicao.aplicado)}</td>
        <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{reais(a.posicao.valorAtual)}</td>
        <td className={`whitespace-nowrap px-4 py-2 text-right font-mono ${r >= 0 ? "text-success" : "text-destructive"}`}>{`${r >= 0 ? "+ " : "− "}${reais(Math.abs(r))}`}</td>
        <td className="px-2 py-2">
          <BotaoAcoes itens={itens} onSelect={aoEscolher} rotulo={`Ações do ativo ${a.nome}`} className="size-8" />
        </td>
      </LinhaComMenu>
    );
  }
}
