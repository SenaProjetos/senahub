"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import { toast } from "sonner";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { brl, formatarData } from "@/lib/utils";
import { CriarRegraDialog, type LancamentoParaRegra } from "@/components/financeiro/regras/criar-regra-dialog";
import {
  ACAO_CRIAR_REGRA_COMPRA,
  ACAO_EDITAR_COMPRA,
  ACAO_ESTORNAR_COMPRA,
  ACAO_EXCLUIR_COMPRA,
  ACAO_PAGAR_COMPRA,
  itensDeCompra,
} from "@/modules/financeiro/cartoes/acoes";
import { motivoParaNaoPagar, rotuloDaCompetencia, somarCompetencia } from "@/modules/financeiro/cartoes/ciclo";
import type { CartaoDto, CompraDto, FaturaDto } from "@/modules/financeiro/cartoes/queries";
import { estornarLancamento, excluirLancamento } from "@/modules/financeiro/lancamentos/actions";
import { CompraDialog, PagamentoDialog, type AlvoDePagamento, type OpcoesCartoes } from "./dialogos";

/**
 * Uma fatura do cartão (mock "Fatura aberta, pagar fatura e reembolso" e "Cartão pessoal — fatura do
 * sócio"): as compras do ciclo, o total e o pagamento. No cartão pessoal os rótulos falam em reembolso
 * e cada despesa pode ser paga sozinha.
 */
export function FaturaView({
  cartao,
  fatura,
  compras,
  opcoes,
  podeGerir,
  hoje,
  subnav,
}: {
  cartao: CartaoDto;
  fatura: FaturaDto;
  compras: CompraDto[];
  opcoes: OpcoesCartoes;
  podeGerir: boolean;
  hoje: string;
  subnav?: React.ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, iniciar] = useTransition();
  const [editando, setEditando] = useState<CompraDto | null>(null);
  const [comprando, setComprando] = useState(false);
  const [pagando, setPagando] = useState<AlvoDePagamento | null>(null);
  const [regraDe, setRegraDe] = useState<LancamentoParaRegra | null>(null);

  const pessoal = cartao.tipo === "pessoal";
  const bloqueioDoPagamento = motivoParaNaoPagar(
    { fimCiclo: fatura.fimCiclo },
    { emAberto: fatura.comprasEmAberto, pagas: fatura.compras - fatura.comprasEmAberto },
    hoje,
  );

  const rodar = (p: Promise<{ ok: boolean; error?: string }>, ok: string) =>
    iniciar(async () => {
      const r = await p;
      if (!r.ok) return void toast.error(r.error ?? "Não foi possível.");
      toast.success(ok);
      router.refresh();
    });

  async function aoSelecionar(c: CompraDto, item: AcaoItemAcao) {
    // Confirmação SEMPRE antes da transição (React 19 suspenderia o diálogo dentro dela).
    if (item.confirmar && !(await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: item.variant === "destructive" ? "destructive" : "default" }))) return;
    if (item.id === ACAO_EDITAR_COMPRA) setEditando(c);
    else if (item.id === ACAO_PAGAR_COMPRA) {
      setPagando({ tipo: "compra", lancamentoId: c.id, rotulo: `${c.descricao} — ${formatarData(c.data)}`, totalCentavos: c.valorCentavos, restanteCentavos: fatura.emAbertoCentavos - c.valorCentavos });
    } else if (item.id === ACAO_ESTORNAR_COMPRA) rodar(estornarLancamento({ id: c.id }), "Estornado: a compra voltou para a fatura.");
    else if (item.id === ACAO_EXCLUIR_COMPRA) rodar(excluirLancamento({ id: c.id }), "Compra excluída.");
    else if (item.id === ACAO_CRIAR_REGRA_COMPRA) {
      setRegraDe({ id: c.id, descricao: c.descricao, categoria: c.categoria, temCentroOuProjeto: !!(c.centro || c.projeto) });
    }
  }

  const titulo = pessoal ? `Reembolsos a ${cartao.socioNome ?? "sócio"}` : `Fatura de ${rotuloDaCompetencia(fatura.competencia).toLowerCase()}`;
  const linkDaCompetencia = (c: string) => `/financeiro/cartoes/${cartao.id}?fatura=${c}`;

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo={titulo}
        descricao={
          pessoal
            ? "Despesas pagas no cartão pessoal, juntas numa fatura com vencimento."
            : `${cartao.nome}${cartao.ultimosDigitos ? ` ••••${cartao.ultimosDigitos}` : ""} · compras de ${formatarData(fatura.inicioCiclo)} a ${formatarData(fatura.fimCiclo)}.`
        }
        acoes={
          podeGerir ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setComprando(true)}>
                {pessoal ? "Lançar despesa" : "Lançar compra"}
              </Button>
              <Button
                size="sm"
                disabled={!!bloqueioDoPagamento}
                title={bloqueioDoPagamento ?? undefined}
                onClick={() =>
                  setPagando({
                    tipo: "fatura",
                    faturaId: fatura.id,
                    rotulo: `${rotuloDaCompetencia(fatura.competencia)} — ${cartao.nome}`,
                    totalCentavos: fatura.emAbertoCentavos,
                    vencimento: fatura.vencimento,
                    pessoal,
                  })
                }
              >
                {pessoal ? "Reembolsar" : "Pagar fatura"}
              </Button>
            </>
          ) : undefined
        }
      />
      {subnav}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" render={<Link href={linkDaCompetencia(somarCompetencia(fatura.competencia, -1))} />} aria-label="Fatura anterior">
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <span className="font-medium">{rotuloDaCompetencia(fatura.competencia)}</span>
        <Button size="sm" variant="ghost" render={<Link href={linkDaCompetencia(somarCompetencia(fatura.competencia, 1))} />} aria-label="Próxima fatura">
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <Button size="sm" variant="ghost" render={<Link href={`/financeiro/cartoes?cartao=${cartao.id}`} />}>
          Todas as faturas
        </Button>
      </div>

      <section aria-label="Resumo" className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
        <KpiCard variante="indicador" label={pessoal ? "A reembolsar" : "Total da fatura"} valor={brl(fatura.emAbertoCentavos / 100)} detalhe={`${fatura.comprasEmAberto} de ${fatura.compras} ${fatura.compras === 1 ? "compra" : "compras"}`} />
        <KpiCard variante="indicador" label="Fecha em" valor={formatarData(fatura.fimCiclo)} detalhe="depois disso, vai para a fatura seguinte" />
        <KpiCard variante="indicador" label="Vence em" valor={formatarData(fatura.vencimento)} detalhe="aparece no planejador nessa data" />
      </section>

      <p className="rounded-sm border bg-muted/30 px-3 py-2 text-[13px]">
        <b>Cada compra já entrou na DRE no dia dela.</b> O que vence em {formatarData(fatura.vencimento)} é {pessoal ? "o reembolso" : "o pagamento da fatura"}: sai do caixa e{" "}
        <b>não</b> é uma despesa nova.{pessoal ? " Dá para pagar tudo de uma vez ou uma despesa por vez." : ""}
      </p>

      {compras.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nenhuma compra nesta fatura."
          description="Lance uma compra para ela entrar no ciclo deste cartão."
          action={podeGerir ? <Button size="sm" onClick={() => setComprando(true)}>Lançar compra</Button> : undefined}
        />
      ) : (
        <section aria-label="Compras da fatura" className="overflow-hidden rounded-sm border bg-card shadow-[var(--card-shadow)]">
          <div className="px-3 pt-2">
            <DicaMenuContexto />
          </div>
          {/* `relative`: o `sr-only` da última coluna é absoluto e, sem ancestral posicionado, escaparia da rolagem. */}
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-2">Compra</th>
                  <th className="px-4 py-2">Descrição</th>
                  <th className="px-4 py-2">Categoria</th>
                  <th className="px-4 py-2">Projeto</th>
                  <th className="px-4 py-2">Parcela</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2">Situação</th>
                  <th className="w-12 px-2 py-2">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>{compras.map((c) => renderCompra(c))}</tbody>
              <tfoot>
                <tr className="border-t font-bold">
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2">{pessoal ? "A reembolsar" : "Em aberto"}</td>
                  <td className="px-4 py-2" colSpan={3} />
                  <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{brl(fatura.emAbertoCentavos / 100)}</td>
                  <td className="px-4 py-2" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      <p className="text-[12.5px] text-muted-foreground">
        Compra parcelada gera uma parcela por fatura, cada uma com a categoria e o projeto já preenchidos; a despesa de cada parcela é da data
        dela. Nesta versão não há pagamento parcial de fatura.
      </p>

      <CompraDialog cartao={cartao} compra={editando} aberto={editando !== null || comprando} onClose={(salvou) => { setEditando(null); setComprando(false); if (salvou) router.refresh(); }} opcoes={opcoes} />
      <PagamentoDialog alvo={pagando} contaPadraoId={cartao.contaPadraoId} opcoes={opcoes} onClose={(pagou) => { setPagando(null); if (pagou) router.refresh(); }} />
      <CriarRegraDialog lancamento={regraDe} onClose={() => setRegraDe(null)} />
    </div>
  );

  // Função de renderização, NÃO componente: um componente definido aqui dentro remontaria as linhas e
  // fecharia o menu de contexto aberto (ADR-0002).
  function renderCompra(c: CompraDto) {
    const itens = itensDeCompra({ descricao: c.descricao, paga: c.paga, temCategoria: c.temCategoria }, { podeGerir, pessoal });
    const aoEscolher = (item: AcaoItemAcao) => void aoSelecionar(c, item);
    return (
      <LinhaComMenu key={c.id} itens={itens} onSelect={aoEscolher} render={<tr className={`border-b last:border-0 hover:bg-muted/20 data-[popup-open]:bg-muted/30 ${c.paga ? "opacity-70" : ""}`} />}>
        <td className="px-4 py-2 font-mono text-xs">{formatarData(c.data)}</td>
        <td className="px-4 py-2 font-medium">{c.descricao}</td>
        <td className="px-4 py-2 text-xs text-muted-foreground">{c.categoria}</td>
        <td className="px-4 py-2 text-xs text-muted-foreground">{c.projeto ?? "Sem projeto"}</td>
        <td className="px-4 py-2 text-xs">{c.parcela ?? <span className="text-muted-foreground">à vista</span>}</td>
        <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{brl(c.valorCentavos / 100)}</td>
        <td className="px-4 py-2 text-xs">
          {c.paga ? (
            <span className="rounded-sm border border-success px-1.5 py-0.5 text-success">
              {pessoal ? "Reembolsada" : "Paga"} {c.dataPagamento ? formatarData(c.dataPagamento) : ""}
            </span>
          ) : (
            <span className="rounded-sm border border-warning px-1.5 py-0.5 text-warning">{pessoal ? "A reembolsar" : "Em aberto"}</span>
          )}
        </td>
        <td className="px-2 py-2">
          <BotaoAcoes itens={itens} onSelect={aoEscolher} rotulo={`Ações da compra ${c.descricao}`} className="size-8" />
        </td>
      </LinhaComMenu>
    );
  }
}
