"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Info, Printer, TriangleAlert, Wallet } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { estornarLancamento } from "@/modules/financeiro/lancamentos/actions";
import { itensDeLinhaDoExtrato, ACAO_COPIAR_LINHA, ACAO_ESTORNAR_LINHA } from "@/modules/financeiro/extrato/acoes";
import { passaConciliacao, type FiltroConciliacao } from "@/modules/financeiro/extrato/calculo";
import type { DadosDoExtrato, MovimentoDoExtrato } from "@/modules/financeiro/extrato/queries";
import { copiarTexto } from "@/lib/clipboard";
import { brl, formatarData } from "@/lib/utils";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function mesVizinho(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const rotuloDoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} de ${a}`;
};
const reais = (c: number) => brl(c / 100);
const dia = (iso: string) => formatarData(`${iso}T00:00:00`);

/**
 * Extrato por conta (M0): saldo inicial, entradas, saídas e saldo final de UMA conta, linha a linha com
 * saldo corrido e a conciliação à vista. Se o último OFX do mês trouxe o saldo do banco, a tela confere
 * com o do sistema. Cada linha tem menu de contexto e `...` (ADR-0002, `itensDeLinhaDoExtrato`).
 */
export function ExtratoView({
  dados,
  contas,
  podeGerir,
  podeConciliar,
  subnav,
}: {
  dados: DadosDoExtrato;
  contas: { id: string; nome: string }[];
  podeGerir: boolean;
  podeConciliar: boolean;
  subnav?: React.ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, start] = useTransition();
  const [filtro, setFiltro] = useState<FiltroConciliacao>("tudo");
  const { extrato, conta, mes, conferencia, semConta } = dados;

  const linhas = useMemo(() => extrato.linhas.filter((l) => passaConciliacao(l.conciliado, filtro)), [extrato.linhas, filtro]);
  const conciliadas = extrato.linhas.filter((l) => l.conciliado).length;

  function irPara(contaId: string, m: string) {
    router.push(`/financeiro/extrato?conta=${contaId}&mes=${m}`);
  }

  async function aoSelecionar(l: MovimentoDoExtrato, item: AcaoItemAcao) {
    if (item.confirmar) {
      // `confirm()` ANTES do start (React 19: dentro da transição o diálogo trava).
      const ok = await confirm({
        title: item.confirmar.titulo,
        description: item.confirmar.descricao,
        confirmLabel: item.confirmar.rotuloConfirmar,
        variant: item.variant === "destructive" ? "destructive" : "default",
      });
      if (!ok) return;
    }
    if (item.id === ACAO_COPIAR_LINHA) {
      if (await copiarTexto(l.descricao)) toast.success("Descrição copiada.");
      else toast.error("Não foi possível copiar a descrição.");
    } else if (item.id === ACAO_ESTORNAR_LINHA) {
      start(async () => {
        const r = await estornarLancamento({ id: l.id });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Estornado: voltou a ficar em aberto.");
        router.refresh();
      });
    }
  }

  // Função de render (não componente aninhado): senão a linha remonta e fecha o menu aberto (ADR-0002).
  function linha(l: MovimentoDoExtrato & { efeitoCentavos: number; saldoCentavos: number }) {
    const menu = itensDeLinhaDoExtrato({ id: l.id, conciliado: l.conciliado, deProducao: l.deProducao }, { podeGerir, podeConciliar });
    return (
      <LinhaComMenu
        key={l.id}
        itens={menu}
        onSelect={(item) => void aoSelecionar(l, item)}
        render={<tr className="border-b last:border-0 hover:bg-muted/20 data-[popup-open]:bg-muted/30" />}
      >
        <td className="px-3 py-2 font-mono text-xs">{dia(l.dia)}</td>
        <td className="px-3 py-2">
          <div className="font-medium">{l.descricao}</div>
          {l.projeto && <div className="text-xs text-muted-foreground">{l.projeto}</div>}
          {l.deTransferencia && <div className="text-xs text-muted-foreground">Transferência entre contas: não entra no resultado</div>}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">{l.categoria}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-success">{l.efeitoCentavos > 0 ? `+ ${reais(l.efeitoCentavos)}` : ""}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-destructive">{l.efeitoCentavos < 0 ? `− ${reais(-l.efeitoCentavos)}` : ""}</td>
        <td className={`whitespace-nowrap px-3 py-2 text-right font-mono ${l.saldoCentavos < 0 ? "text-destructive" : ""}`}>{reais(l.saldoCentavos)}</td>
        <td className="px-3 py-2">
          {l.conciliado ? (
            <Badge variant="outline" className="border-success text-success">Conciliado</Badge>
          ) : (
            <Badge variant="outline" className="border-warning text-warning">Falta conciliar</Badge>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <BotaoAcoes itens={menu} onSelect={(item) => void aoSelecionar(l, item)} rotulo={`Ações de ${l.descricao}`} />
        </td>
      </LinhaComMenu>
    );
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Extrato por conta"
        descricao="Saldo corrido, o que já foi conciliado e o que falta."
        acoes={
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir
          </Button>
        }
      />
      {subnav}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <div className="text-xs font-semibold">Conta</div>
          <Select value={conta.id} onValueChange={(v) => v && irPara(v, mes)}>
            <SelectTrigger className="w-72" aria-label="Conta"><SelectValue /></SelectTrigger>
            <SelectContent>
              {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-semibold">Mês</div>
          <div className="inline-flex items-center gap-1" role="group" aria-label="Mês">
            <Button size="icon" variant="outline" aria-label="Mês anterior" render={<Link href={`/financeiro/extrato?conta=${conta.id}&mes=${mesVizinho(mes, -1)}`} />}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-36 px-2 text-center text-sm font-semibold first-letter:uppercase" aria-live="polite">{rotuloDoMes(mes)}</span>
            <Button size="icon" variant="outline" aria-label="Próximo mês" render={<Link href={`/financeiro/extrato?conta=${conta.id}&mes=${mesVizinho(mes, 1)}`} />}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-semibold">Mostrar</div>
          <div className="inline-flex" role="group" aria-label="Conciliação">
            {(["tudo", "conciliado", "falta"] as const).map((f) => (
              <Button key={f} size="sm" variant={filtro === f ? "default" : "outline"} onClick={() => setFiltro(f)} className="rounded-none first:rounded-l-sm last:rounded-r-sm">
                {f === "tudo" ? "Tudo" : f === "conciliado" ? "Conciliado" : "Falta conciliar"}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo da conta">
        <Kpi rotulo={`Saldo em 01/${mes.slice(5)}`} valor={reais(extrato.saldoAnteriorCentavos)} />
        <Kpi rotulo="Entradas" valor={`+ ${reais(extrato.entradasCentavos)}`} cor="text-success" sub={`${extrato.linhas.filter((l) => l.efeitoCentavos > 0).length} lançamentos`} />
        <Kpi rotulo="Saídas" valor={`− ${reais(extrato.saidasCentavos)}`} cor="text-destructive" sub={`${extrato.linhas.filter((l) => l.efeitoCentavos < 0).length} lançamentos`} />
        <Kpi rotulo="Saldo no fim do mês" valor={reais(extrato.saldoFinalCentavos)} sub={`${reais(extrato.saldoAnteriorCentavos)} + ${reais(extrato.entradasCentavos)} − ${reais(extrato.saidasCentavos)}`} />
      </section>

      {conferencia && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-sm ${conferencia.confere ? "border-info/50 bg-info/5" : "border-warning/60 bg-warning/10"}`}
        >
          {conferencia.confere ? <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
          <div>
            {conferencia.confere ? (
              <>
                <b>O saldo confere com o banco:</b> o extrato importado informa {reais(conferencia.bancoCentavos)} em {dia(conferencia.dia)}, igual ao sistema.
              </>
            ) : (
              <>
                <b>O saldo difere do banco em {reais(Math.abs(conferencia.diferencaCentavos))}.</b> Em {dia(conferencia.dia)} o banco informa {reais(conferencia.bancoCentavos)} e o sistema, {reais(conferencia.sistemaCentavos)}. Falta lançar ou conciliar alguma movimentação desta conta.
              </>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {linhas.length === 0 ? (
            <EmptyState icon={Wallet} title="Nenhuma movimentação neste filtro." description="Troque o mês ou a conta." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Descrição</th>
                    <th className="px-3 py-2 font-medium">Categoria</th>
                    <th className="px-3 py-2 text-right font-medium">Entrada</th>
                    <th className="px-3 py-2 text-right font-medium">Saída</th>
                    <th className="px-3 py-2 text-right font-medium">Saldo</th>
                    <th className="px-3 py-2 font-medium">Extrato do banco</th>
                    <th className="relative px-3 py-2"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtro === "tudo" && (
                    <tr className="border-b bg-muted/20">
                      <td className="px-3 py-2 font-mono text-xs">01/{mes.slice(5)}</td>
                      <td className="px-3 py-2 font-medium" colSpan={4}>Saldo anterior</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{reais(extrato.saldoAnteriorCentavos)}</td>
                      <td colSpan={2} />
                    </tr>
                  )}
                  {linhas.map((l) => linha(l))}
                </tbody>
                {filtro === "tudo" && (
                  <tfoot className="border-t font-semibold">
                    <tr>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2">Total do mês</td>
                      <td />
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-success">{reais(extrato.entradasCentavos)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-destructive">{reais(extrato.saidasCentavos)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{reais(extrato.saldoFinalCentavos)}</td>
                      <td className="px-3 py-2 text-xs font-normal text-muted-foreground">{conciliadas} de {extrato.linhas.length} conciliados</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <DicaMenuContexto />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Transferências entre contas próprias aparecem aqui, mas não entram no resultado. Lançamento sem conta não é de nenhuma conta: fica fora de todos os extratos.
        </span>
        {semConta > 0 && (
          <Button size="sm" variant="outline" render={<Link href="/financeiro/lancamentos" />}>
            {semConta} realizado{semConta > 1 ? "s" : ""} sem conta neste mês: ver em Lançamentos
          </Button>
        )}
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor, sub, cor }: { rotulo: string; valor: string; sub?: string; cor?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-sm text-muted-foreground">{rotulo}</div>
        <div className={`font-mono text-xl font-semibold tracking-tight ${cor ?? ""}`}>{valor}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
