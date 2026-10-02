"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Sprout } from "lucide-react";
import { toast } from "sonner";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { KpiCard } from "@/components/ui/kpi-card";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { brl, formatarData } from "@/lib/utils";
import { ACAO_EXCLUIR_MOVIMENTO, itensDoAtivo, itensDoMovimento } from "@/modules/financeiro/investimentos/acoes";
import { excluirMovimentoInvestimento } from "@/modules/financeiro/investimentos/actions";
import { diasEntre, faixaDoIR, ROTULO_LIQUIDEZ, type MovimentoDoAtivo } from "@/modules/financeiro/investimentos/calculo";
import type { DetalheDoAtivo } from "@/modules/financeiro/investimentos/queries";
import { ROTULO_TIPO } from "./dialogos";
import { useAcoesAtivo } from "./use-acoes-ativo";

const reais = (c: number) => brl(c / 100);

const MOV: Record<MovimentoDoAtivo["movimento"], { rotulo: string; vai: string; resultado: boolean }> = {
  aporte: { rotulo: "Aporte", vai: "Transferência da conta para o ativo", resultado: false },
  resgate: { rotulo: "Resgate", vai: "Transferência do ativo para a conta", resultado: false },
  rendimento: { rotulo: "Rendimento", vai: "Receita — rendimento de aplicações", resultado: true },
  imposto: { rotulo: "IR / IOF", vai: "Despesa — IR sobre aplicações", resultado: true },
};

/**
 * Um ativo (mock "Investimentos — detalhe do ativo e Balanço"): posição, movimentos com menu (ADR-0002), dados do
 * ativo e o pedaço do Balanço. Os movimentos são os lançamentos da conta do ativo, lidos e tipados pelo puro.
 */
export function AtivoView({
  detalhe,
  contas,
  balanco,
  podeGerir,
  hoje,
  subnav,
}: {
  detalhe: DetalheDoAtivo;
  contas: { id: string; nome: string }[];
  balanco: { caixa: number; investimentos: number; aReceber: number; ativo: number } | null;
  podeGerir: boolean;
  hoje: string;
  subnav?: React.ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, iniciar] = useTransition();
  const { ativo, movimentos } = detalhe;
  const p = ativo.posicao;
  const acoes = useAcoesAtivo(contas, () => router.push("/financeiro/investimentos"));
  const itensAtivo = itensDoAtivo({ id: ativo.id, nome: ativo.nome, arquivado: ativo.arquivado, valorAtual: p.valorAtual, movimentos: ativo.movimentos }, { podeGerir, naTelaDoAtivo: true });
  const dias = p.primeiroAporte ? diasEntre(p.primeiroAporte, hoje) : null;

  async function aoSelecionarMovimento(m: MovimentoDoAtivo, item: AcaoItemAcao) {
    if (item.confirmar && !(await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: "destructive" }))) return;
    if (item.id === ACAO_EXCLUIR_MOVIMENTO) {
      iniciar(async () => {
        const r = await excluirMovimentoInvestimento({ investimentoId: ativo.id, lancamentoId: m.id });
        if (!r.ok) return void toast.error(r.error);
        toast.success("Movimento excluído.");
        router.refresh();
      });
    }
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo={ativo.nome}
        descricao={[ROTULO_TIPO[ativo.tipo], ativo.instituicao, ativo.indexador].filter(Boolean).join(" · ") || "Investimento"}
        acoes={
          podeGerir && !ativo.arquivado ? (
            <>
              <Button size="sm" variant="outline" onClick={() => acoes.abrirMovimento("aporte", ativo)}>
                <ArrowDownToLine className="size-4" aria-hidden /> Aportar
              </Button>
              <BotaoAcoes itens={itensAtivo} onSelect={(i) => void acoes.tratar(ativo, i)} rotulo={`Ações do ativo ${ativo.nome}`} className="size-8" />
            </>
          ) : podeGerir ? (
            <BotaoAcoes itens={itensAtivo} onSelect={(i) => void acoes.tratar(ativo, i)} rotulo={`Ações do ativo ${ativo.nome}`} className="size-8" />
          ) : undefined
        }
      />
      {subnav}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" render={<Link href="/financeiro/investimentos" />}>
          ← Carteira
        </Button>
        {ativo.arquivado && <span className="rounded-sm border px-2 py-0.5 text-xs">Resgatado · fora da carteira</span>}
        {podeGerir && !ativo.arquivado && (
          <>
            <Button size="sm" variant="outline" onClick={() => acoes.abrirMovimento("rendimento", ativo)}>
              <Sprout className="size-4" aria-hidden /> Registrar rendimento
            </Button>
            <Button size="sm" variant="outline" disabled={p.valorAtual <= 0} onClick={() => acoes.abrirMovimento("resgate", ativo)}>
              <ArrowUpFromLine className="size-4" aria-hidden /> Resgatar
            </Button>
          </>
        )}
      </div>

      <section aria-label="Posição do ativo" className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
        <KpiCard variante="indicador" label="Aplicado" valor={reais(p.aplicado)} detalhe={p.primeiroAporte ? `desde ${formatarData(p.primeiroAporte)}` : "sem aporte"} />
        <KpiCard variante="indicador" label="Rendimento bruto" valor={`+ ${reais(p.rendimentoBruto)}`} />
        <KpiCard
          variante="indicador"
          label="IR provisionado"
          valor={`− ${reais(p.impostos)}`}
          detalhe={ativo.isentoIR ? "ativo isento" : dias != null ? `tabela regressiva hoje: ${faixaDoIR(dias)}` : undefined}
        />
        <KpiCard variante="indicador" label="Valor atual" valor={reais(p.valorAtual)} detalhe="aplicado + rendimento − IR" />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Movimentos do ativo" className="overflow-hidden rounded-sm border bg-card shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
            <h2 className="text-base font-bold">Movimentos</h2>
            <span className="text-xs text-muted-foreground">cada tipo cai numa categoria e numa natureza fixas</span>
          </div>
          {movimentos.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Nenhum movimento ainda. Comece pelo aporte.</p>
          ) : (
            <div className="relative overflow-x-auto">
              <DicaMenuContexto className="px-2" />
              <table className="w-full min-w-[42rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-2">Data</th>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Vai para</th>
                    <th className="whitespace-nowrap px-4 py-2">No resultado?</th>
                    <th className="px-4 py-2 text-right">Valor</th>
                    <th className="w-12 px-2 py-2">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>{movimentos.map((m) => renderMovimento(m))}</tbody>
                <tfoot>
                  <tr className="border-t font-bold">
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2">Valor atual</td>
                    <td className="px-4 py-2" colSpan={2} />
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{reais(p.valorAtual)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="m-4 rounded-sm border bg-muted/30 px-3 py-2 text-[13px]">
            <b>Resgatar</b> pede a conta de destino e quanto caiu nela. Resgate total zera o ativo: a diferença para o valor atual vira rendimento ou IR. O
            valor que volta para a conta é uma transferência.
          </p>
        </section>

        <aside className="grid gap-4">
          {balanco && (
            <section aria-label="No Balanço" className="rounded-sm border border-l-[3px] border-l-primary bg-card p-4 shadow-[var(--card-shadow)]">
              <h2 className="mb-3 text-base font-bold">No Balanço</h2>
              <div className="grid gap-1.5 text-sm">
                <div className="flex justify-between gap-2">
                  <span>Caixa e contas</span>
                  <span className="font-mono">{brl(balanco.caixa)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <b>Investimentos</b>
                  <span className="font-mono">{brl(balanco.investimentos)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>A receber</span>
                  <span className="font-mono">{brl(balanco.aReceber)}</span>
                </div>
                <div className="mt-1 flex justify-between gap-2 border-t pt-1.5 font-bold">
                  <span>Ativo total</span>
                  <span className="font-mono">{brl(balanco.ativo)}</span>
                </div>
              </div>
            </section>
          )}
          <section aria-label="Dados do ativo" className="rounded-sm border bg-card p-4 shadow-[var(--card-shadow)]">
            <h2 className="mb-3 text-base font-bold">Dados do ativo</h2>
            <dl className="grid gap-1.5 text-sm">
              {[
                ["Tipo", ROTULO_TIPO[ativo.tipo]],
                ["Rentabilidade", ativo.indexador ?? "—"],
                ["Liquidez", ROTULO_LIQUIDEZ[ativo.liquidez]],
                ["Vencimento", ativo.vencimento ? formatarData(ativo.vencimento) : "sem prazo"],
                ["IR", ativo.isentoIR ? "isento" : "tabela regressiva"],
                ["Conta de origem", ativo.contaOrigemNome ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <Button size="sm" variant="ghost" className="mt-2" render={<Link href={`/financeiro/extrato?conta=${ativo.contaId}`} />}>
              Ver o extrato do ativo
            </Button>
          </section>
        </aside>
      </div>
      {acoes.dialogos}
    </div>
  );

  // Função de renderização, NÃO componente (ADR-0002).
  function renderMovimento(m: MovimentoDoAtivo) {
    const itens = itensDoMovimento({ id: m.id, movimento: m.movimento }, { podeGerir });
    const meta = MOV[m.movimento];
    return (
      <LinhaComMenu key={m.id} itens={itens} onSelect={(i) => void aoSelecionarMovimento(m, i)} render={<tr className="border-b last:border-0 hover:bg-muted/20 data-[popup-open]:bg-muted/30" />}>
        <td className="px-4 py-2 font-mono text-xs">{formatarData(m.data)}</td>
        <td className="px-4 py-2">
          <b>{meta.rotulo}</b>
          <span className="block text-xs text-muted-foreground">{m.descricao}</span>
        </td>
        <td className="px-4 py-2 text-xs text-muted-foreground">{meta.vai}</td>
        <td className="px-4 py-2 text-xs">
          <span className={`whitespace-nowrap rounded-sm border px-1.5 py-0.5 ${meta.resultado ? "border-success text-success" : ""}`}>{meta.resultado ? "Sim" : "Não, só caixa"}</span>
        </td>
        <td className={`whitespace-nowrap px-4 py-2 text-right font-mono ${m.efeito >= 0 ? "" : "text-destructive"}`}>{`${m.efeito >= 0 ? "+ " : "− "}${reais(Math.abs(m.efeito))}`}</td>
        <td className="px-2 py-2">
          <BotaoAcoes itens={itens} onSelect={(i) => void aoSelecionarMovimento(m, i)} rotulo={`Ações do movimento de ${formatarData(m.data)}`} className="size-8" />
        </td>
      </LinhaComMenu>
    );
  }
}
