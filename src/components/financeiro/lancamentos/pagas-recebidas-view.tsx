"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Search, Wallet } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { LancamentoDetalheDialog } from "./lancamento-detalhe-dialog";
import { CriarRegraDialog, type LancamentoParaRegra } from "@/components/financeiro/regras/criar-regra-dialog";
import { ACAO_CRIAR_REGRA } from "@/modules/financeiro/regras/acoes";
import { estornarLancamento } from "@/modules/financeiro/lancamentos/actions";
import {
  ACAO_COPIAR_DESCRICAO_PAGA,
  ACAO_DETALHES_PAGA,
  ACAO_ESTORNAR_PAGA,
  ACAO_VER_NO_EXTRATO,
  itensDePaga,
} from "@/modules/financeiro/lancamentos/acoes-paga";
import type { PagaItem } from "@/modules/financeiro/lancamentos/queries";
import { copiarTexto } from "@/lib/clipboard";
import { brl, formatarData } from "@/lib/utils";
import { formatarCodigo } from "@/modules/projetos/numbering";

type Tipo = "todas" | "despesa" | "receita";
type Conciliacao = "todas" | "conciliadas" | "sem";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function mesVizinho(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rotuloDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

const valorPago = (l: PagaItem) => l.valorEfetivo ?? l.valor;

/**
 * Aba "Pagas e recebidas" de Contas (M0): o que já saiu ou entrou no mês, pela data do pagamento, com a
 * conciliação à vista. Cada linha tem menu de contexto e `...` (ADR-0002, descritor `itensDePaga`).
 * Estornar é a única ação que muda dado e vai pela máquina de situações do servidor.
 */
export function PagasRecebidasView({
  itens,
  mes,
  podeGerir,
  subnav,
}: {
  itens: PagaItem[];
  mes: string;
  podeGerir: boolean;
  subnav?: React.ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, start] = useTransition();
  const [tipo, setTipo] = useState<Tipo>("todas");
  const [conc, setConc] = useState<Conciliacao>("todas");
  const [busca, setBusca] = useState("");
  const [detalhe, setDetalhe] = useState<PagaItem | null>(null);
  const [regraDe, setRegraDe] = useState<LancamentoParaRegra | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((l) => {
      if (tipo !== "todas" && l.tipo !== tipo) return false;
      if (conc === "conciliadas" && !l.conciliado) return false;
      if (conc === "sem" && l.conciliado) return false;
      if (q && !`${l.descricao} ${l.projeto?.nome ?? ""} ${l.fornecedor?.nome ?? ""} ${l.cliente?.nome ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [itens, tipo, conc, busca]);

  const totais = useMemo(() => {
    let pago = 0;
    let recebido = 0;
    let nPago = 0;
    let nRecebido = 0;
    let conciliadas = 0;
    let diferentes = 0;
    let diferenca = 0;
    for (const l of lista) {
      const v = Math.round(valorPago(l) * 100);
      if (l.tipo === "despesa") {
        pago += v;
        nPago++;
      } else {
        recebido += v;
        nRecebido++;
      }
      if (l.conciliado) conciliadas++;
      if (l.valorEfetivo != null && Math.round(l.valorEfetivo * 100) !== Math.round(l.valor * 100)) {
        diferentes++;
        diferenca += Math.round(l.valor * 100) - v;
      }
    }
    return { pago: pago / 100, recebido: recebido / 100, nPago, nRecebido, conciliadas, diferentes, diferenca: diferenca / 100 };
  }, [lista]);

  async function aoSelecionar(l: PagaItem, item: AcaoItemAcao) {
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
    if (item.id === ACAO_DETALHES_PAGA) setDetalhe(l);
    else if (item.id === ACAO_CRIAR_REGRA) setRegraDe({ id: l.id, descricao: l.descricao, categoria: l.categoria ? `${l.categoria.codigo} ${l.categoria.nome}` : null, temCentroOuProjeto: l.centro != null || l.projeto != null });
    else if (item.id === ACAO_VER_NO_EXTRATO && l.contaId) {
      router.push(`/financeiro/extrato?conta=${l.contaId}&mes=${mes}`);
    } else if (item.id === ACAO_COPIAR_DESCRICAO_PAGA) {
      if (await copiarTexto(l.descricao)) toast.success("Descrição copiada.");
      else toast.error("Não foi possível copiar a descrição.");
    } else if (item.id === ACAO_ESTORNAR_PAGA) {
      start(async () => {
        const r = await estornarLancamento({ id: l.id });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Estornado: voltou a ficar em aberto.");
        if (r.data.aviso) toast.warning(r.data.aviso);
        router.refresh();
      });
    }
  }

  // Função de render (não componente aninhado): senão a linha remonta e fecha o menu aberto (ADR-0002).
  function linha(l: PagaItem) {
    const menu = itensDePaga(
      { anexos: l.anexos.length, conciliado: l.conciliado, deProducao: l.pagamentoProjetistaId != null, temConta: l.contaId != null, temCategoria: l.categoria != null },
      { podeGerir },
    );
    const parcial = l.valorEfetivo != null && Math.round(l.valorEfetivo * 100) !== Math.round(l.valor * 100);
    return (
      <LinhaComMenu
        key={l.id}
        itens={menu}
        onSelect={(item) => void aoSelecionar(l, item)}
        render={<tr className="border-b last:border-0 hover:bg-muted/20 data-[popup-open]:bg-muted/30" />}
      >
        <td className="px-3 py-2 font-mono text-xs">{formatarData(l.dataConfirmacao ?? l.data)}</td>
        <td className="px-3 py-2">
          <div className="font-medium">{l.descricao}</div>
          {l.projeto && <div className="text-xs text-muted-foreground">{formatarCodigo(l.projeto.codigo)} · {l.projeto.nome}</div>}
          {parcial && <div className="text-xs text-muted-foreground">Pago {brl(Math.abs(l.valor - valorPago(l)))} {valorPago(l) < l.valor ? "a menos" : "a mais"} que o previsto</div>}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">{l.categoria.codigo} {l.categoria.nome}</td>
        <td className="px-3 py-2 text-xs">{l.conta?.nome ?? <span className="text-muted-foreground">Sem conta</span>}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs text-muted-foreground">{brl(l.valor)}</td>
        <td className={`whitespace-nowrap px-3 py-2 text-right font-mono ${l.tipo === "receita" ? "text-success" : ""}`}>
          {l.tipo === "receita" ? "+" : "−"} {brl(valorPago(l))}
        </td>
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
      <CabecalhoPagina titulo="Contas" descricao="O que vence e o que já foi pago ou recebido." />
      {subnav}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex" role="group" aria-label="Tipo">
          {(["todas", "despesa", "receita"] as const).map((t) => (
            <Button key={t} size="sm" variant={tipo === t ? "default" : "outline"} onClick={() => setTipo(t)} className="rounded-none first:rounded-l-sm last:rounded-r-sm">
              {t === "todas" ? "Todas" : t === "despesa" ? "Pagas" : "Recebidas"}
            </Button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1" role="group" aria-label="Mês">
          <Button size="icon" variant="outline" aria-label="Mês anterior" render={<Link href={`/financeiro/contas?situacao=pagas&mes=${mesVizinho(mes, -1)}`} />}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-36 px-2 text-center text-sm font-semibold first-letter:uppercase" aria-live="polite">{rotuloDoMes(mes)}</span>
          <Button size="icon" variant="outline" aria-label="Próximo mês" render={<Link href={`/financeiro/contas?situacao=pagas&mes=${mesVizinho(mes, 1)}`} />}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar descrição ou projeto" aria-label="Buscar" className="w-64 pl-8" />
        </div>
        <div className="inline-flex" role="group" aria-label="Conciliação">
          {(["todas", "conciliadas", "sem"] as const).map((c) => (
            <Button key={c} size="sm" variant={conc === c ? "default" : "outline"} onClick={() => setConc(c)} className="rounded-none first:rounded-l-sm last:rounded-r-sm">
              {c === "todas" ? "Todas" : c === "conciliadas" ? "Conciliadas" : "Sem conciliar"}
            </Button>
          ))}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Totais do mês">
        <Kpi rotulo="Pago no mês" valor={brl(totais.pago)} sub={`${totais.nPago} contas`} />
        <Kpi rotulo="Recebido no mês" valor={brl(totais.recebido)} sub={`${totais.nRecebido} contas`} />
        <Kpi rotulo="Conciliadas com o extrato" valor={`${totais.conciliadas} de ${lista.length}`} sub={`${lista.length - totais.conciliadas} faltam conciliar`} />
        <Kpi
          rotulo="Pago com desconto ou parcial"
          valor={String(totais.diferentes)}
          sub={totais.diferentes > 0 ? `${brl(Math.abs(totais.diferenca))} ${totais.diferenca >= 0 ? "a menos" : "a mais"} que o previsto` : "tudo pelo valor previsto"}
        />
      </section>

      <Card>
        <CardContent className="p-0">
          {lista.length === 0 ? (
            <EmptyState icon={Wallet} title="Nada pago ou recebido neste filtro." description="Troque o mês ou limpe a busca." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Pago em</th>
                    <th className="px-3 py-2 font-medium">Descrição</th>
                    <th className="px-3 py-2 font-medium">Categoria</th>
                    <th className="px-3 py-2 font-medium">Conta</th>
                    <th className="px-3 py-2 text-right font-medium">Previsto</th>
                    <th className="px-3 py-2 text-right font-medium">Pago</th>
                    <th className="px-3 py-2 font-medium">Conciliação</th>
                    <th className="relative px-3 py-2"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>{lista.map((l) => linha(l))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <DicaMenuContexto />
      <LancamentoDetalheDialog lancamento={detalhe} podeGerir={podeGerir} onClose={() => setDetalhe(null)} />
      <CriarRegraDialog lancamento={regraDe} onClose={() => setRegraDe(null)} />
    </div>
  );
}

function Kpi({ rotulo, valor, sub }: { rotulo: string; valor: string; sub: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-sm text-muted-foreground">{rotulo}</div>
        <div className="font-mono text-xl font-semibold tracking-tight">{valor}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}
