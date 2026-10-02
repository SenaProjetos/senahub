"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CreditCard, Plus } from "lucide-react";
import { toast } from "sonner";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { EmptyState } from "@/components/ui/empty-state";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Progress } from "@/components/ui/progress";
import { brl, formatarData } from "@/lib/utils";
import {
  ACAO_ATIVAR_CARTAO,
  ACAO_DESATIVAR_CARTAO,
  ACAO_EDITAR_CARTAO,
  ACAO_EXCLUIR_CARTAO,
  ACAO_LANCAR_COMPRA,
  ACAO_PAGAR_FATURA,
  ACAO_VER_COMPRAS,
  ACAO_VER_FATURA,
  itensDeCartao,
  itensDeFatura,
} from "@/modules/financeiro/cartoes/acoes";
import { excluirCartao, salvarCartao } from "@/modules/financeiro/cartoes/actions";
import { rotuloDaCompetencia } from "@/modules/financeiro/cartoes/ciclo";
import type { CartaoDto, FaturaDto } from "@/modules/financeiro/cartoes/queries";
import { CartaoDialog, CompraDialog, PagamentoDialog, type AlvoDePagamento, type OpcoesCartoes } from "./dialogos";

const SITUACAO: Record<FaturaDto["situacao"], { texto: string; classe: string }> = {
  aberta: { texto: "Aberta", classe: "border-primary text-primary" },
  fechada: { texto: "Fechada · a pagar", classe: "border-warning text-warning" },
  paga: { texto: "Paga", classe: "border-success text-success" },
  vazia: { texto: "Sem compras", classe: "text-muted-foreground" },
};

/**
 * Cartões de crédito (mock "Cartões de crédito"): um card por cartão com os números do ciclo e, abaixo,
 * as faturas do cartão escolhido. Menu de contexto e `...` em cartão e fatura (ADR-0002).
 */
export function CartoesView({
  cartoes,
  cartaoAtual,
  faturas,
  opcoes,
  podeGerir,
  hoje,
  subnav,
}: {
  cartoes: CartaoDto[];
  cartaoAtual: CartaoDto | null;
  faturas: FaturaDto[];
  opcoes: OpcoesCartoes;
  podeGerir: boolean;
  hoje: string;
  subnav?: React.ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, iniciar] = useTransition();
  const [editando, setEditando] = useState<{ cartao: CartaoDto | null } | null>(null);
  const [comprando, setComprando] = useState<CartaoDto | null>(null);
  const [pagando, setPagando] = useState<AlvoDePagamento | null>(null);

  const rodar = (p: Promise<{ ok: boolean; error?: string }>, ok: string) =>
    iniciar(async () => {
      const r = await p;
      if (!r.ok) return void toast.error(r.error ?? "Não foi possível.");
      toast.success(ok);
      router.refresh();
    });

  async function aoSelecionarCartao(c: CartaoDto, item: AcaoItemAcao) {
    // Confirmação SEMPRE antes da transição (React 19 suspenderia o diálogo dentro dela).
    if (item.confirmar && !(await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: item.variant === "destructive" ? "destructive" : "default" }))) return;
    if (item.id === ACAO_VER_FATURA) router.push(`/financeiro/cartoes/${c.id}`);
    else if (item.id === ACAO_LANCAR_COMPRA) setComprando(c);
    else if (item.id === ACAO_EDITAR_CARTAO) setEditando({ cartao: c });
    else if (item.id === ACAO_ATIVAR_CARTAO || item.id === ACAO_DESATIVAR_CARTAO) {
      rodar(
        salvarCartao({
          id: c.id,
          nome: c.nome,
          ultimosDigitos: c.ultimosDigitos ?? "",
          tipo: c.tipo,
          socioId: null,
          limite: c.limiteCentavos != null ? c.limiteCentavos / 100 : null,
          diaFechamento: c.diaFechamento,
          diaVencimento: c.diaVencimento,
          contaPadraoId: c.contaPadraoId ?? "",
          ativo: item.id === ACAO_ATIVAR_CARTAO,
        }),
        item.id === ACAO_ATIVAR_CARTAO ? "Cartão ativado." : "Cartão inativo.",
      );
    } else if (item.id === ACAO_EXCLUIR_CARTAO) rodar(excluirCartao({ id: c.id }), "Cartão excluído.");
  }

  async function aoSelecionarFatura(f: FaturaDto, item: AcaoItemAcao) {
    if (item.confirmar && !(await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar }))) return;
    if (item.id === ACAO_VER_COMPRAS) router.push(`/financeiro/cartoes/${cartaoAtual?.id}?fatura=${f.competencia}`);
    else if (item.id === ACAO_PAGAR_FATURA && cartaoAtual) {
      setPagando({
        tipo: "fatura",
        faturaId: f.id,
        rotulo: `${rotuloDaCompetencia(f.competencia)} — ${cartaoAtual.nome}`,
        totalCentavos: f.emAbertoCentavos,
        vencimento: f.vencimento,
        pessoal: cartaoAtual.tipo === "pessoal",
      });
    }
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Cartões de crédito"
        descricao="Compras na data em que acontecem; o caixa só sai quando a fatura é paga."
        acoes={
          podeGerir ? (
            <Button size="sm" onClick={() => setEditando({ cartao: null })}>
              <Plus className="size-4" aria-hidden /> Novo cartão
            </Button>
          ) : undefined
        }
      />
      {subnav}

      {cartoes.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum cartão cadastrado."
          description="Cadastre o cartão da empresa ou o cartão pessoal de um sócio: a compra vira despesa no dia dela e o caixa só sai no pagamento."
          action={podeGerir ? <Button size="sm" onClick={() => setEditando({ cartao: null })}>Novo cartão</Button> : undefined}
        />
      ) : (
        <>
          <section aria-label="Cartões" className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
            {cartoes.map((c) => renderCartao(c))}
          </section>

          {cartaoAtual && (
            <section aria-label={`Faturas de ${cartaoAtual.nome}`} className="overflow-hidden rounded-sm border bg-card shadow-[var(--card-shadow)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="text-base font-bold">
                  {cartaoAtual.tipo === "pessoal" ? "Reembolsos" : "Faturas"} — {cartaoAtual.nome}
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {cartoes.map((c) => (
                    <Link
                      key={c.id}
                      href={`/financeiro/cartoes?cartao=${c.id}`}
                      className={`rounded-sm border px-2 py-1 text-xs ${c.id === cartaoAtual.id ? "border-primary text-primary" : "text-muted-foreground"}`}
                      aria-current={c.id === cartaoAtual.id ? "true" : undefined}
                    >
                      {c.nome}
                    </Link>
                  ))}
                </div>
              </div>
              {faturas.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Nenhuma compra lançada neste cartão ainda.</p>
              ) : (
                /* `relative`: o `sr-only` da última coluna é absoluto e, sem ancestral posicionado, escaparia da rolagem. */
                <div className="relative overflow-x-auto">
                  {/* A dica fica sobre a lista de faturas (altura zero), não sobre o card do cartão. */}
                  <DicaMenuContexto className="px-2" />
                  <table className="w-full min-w-[42rem] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                        <th className="px-4 py-2">Fatura</th>
                        <th className="px-4 py-2">Compras de</th>
                        <th className="px-4 py-2">Fecha</th>
                        <th className="px-4 py-2">Vence</th>
                        <th className="px-4 py-2 text-right">Total</th>
                        <th className="px-4 py-2">Situação</th>
                        <th className="w-12 px-2 py-2">
                          <span className="sr-only">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>{faturas.map((f) => renderFatura(f))}</tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}

      <p className="text-[12.5px] text-muted-foreground">
        Regra, nos dois cartões: a compra é despesa da data da compra (entra na DRE do mês certo) e o caixa só sai no pagamento. Pagar a fatura
        realiza as compras daquele ciclo — nunca cria uma segunda despesa.
      </p>

      <CartaoDialog cartao={editando?.cartao ?? null} aberto={editando !== null} onClose={(salvou) => { setEditando(null); if (salvou) router.refresh(); }} opcoes={opcoes} />
      <CompraDialog cartao={comprando} compra={null} aberto={comprando !== null} onClose={(salvou) => { setComprando(null); if (salvou) router.refresh(); }} opcoes={opcoes} />
      <PagamentoDialog alvo={pagando} contaPadraoId={cartaoAtual?.contaPadraoId} opcoes={opcoes} onClose={(pagou) => { setPagando(null); if (pagou) router.refresh(); }} />
    </div>
  );

  // Funções de renderização, NÃO componentes: um componente definido aqui dentro remontaria as linhas
  // e fecharia o menu de contexto aberto (ADR-0002).
  function renderCartao(c: CartaoDto) {
    const itens = itensDeCartao({ nome: c.nome, ativo: c.ativo, temCompras: c.abertaCentavos + c.fechadaCentavos + c.pagoNoAnoCentavos > 0 }, { podeGerir });
    const aoEscolher = (item: AcaoItemAcao) => void aoSelecionarCartao(c, item);
    const usado = c.abertaCentavos + c.fechadaCentavos;
    const pct = c.limiteCentavos ? Math.min(100, Math.round((usado / c.limiteCentavos) * 100)) : null;
    return (
      <LinhaComMenu
        key={c.id}
        itens={itens}
        onSelect={aoEscolher}
        render={<article className={`rounded-sm border bg-card p-4 shadow-[var(--card-shadow)] ${c.ativo ? "" : "opacity-70"} ${c.id === cartaoAtual?.id ? "border-l-[3px] border-l-primary" : ""}`} />}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold">
              {c.nome}
              {c.ultimosDigitos && <span className="ml-1 font-mono text-sm text-muted-foreground">••••{c.ultimosDigitos}</span>}
            </h2>
            <span className="text-xs text-muted-foreground">
              {c.tipo === "pessoal" ? `Pessoal — vira reembolso a ${c.socioNome ?? "sócio"}` : "Da empresa"} · fecha dia {c.diaFechamento}, vence dia {c.diaVencimento}
              {c.ativo ? "" : " · inativo"}
            </span>
          </div>
          <BotaoAcoes itens={itens} onSelect={aoEscolher} rotulo={`Ações do cartão ${c.nome}`} className="size-8 shrink-0" />
        </div>
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Fatura aberta</div>
            <div className="font-mono text-xl font-semibold">{brl(c.abertaCentavos / 100)}</div>
            <div className="text-xs text-muted-foreground">{rotuloDaCompetencia(c.competenciaAberta)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{c.tipo === "pessoal" ? "Fechada a reembolsar" : "Fechada a pagar"}</div>
            <div className="font-mono text-xl font-semibold">{brl(c.fechadaCentavos / 100)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{c.tipo === "pessoal" ? "Reembolsado no ano" : "Pago no ano"}</div>
            <div className="font-mono text-xl font-semibold">{brl(c.pagoNoAnoCentavos / 100)}</div>
          </div>
        </div>
        {pct !== null && c.limiteCentavos && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Limite usado</span>
              <span className="font-mono">
                {brl(usado / 100)} · {pct}% de {brl(c.limiteCentavos / 100)}
              </span>
            </div>
            <Progress valor={pct} rotulo={`Limite usado: ${pct}%`} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" render={<Link href={`/financeiro/cartoes/${c.id}`} />}>
            {c.tipo === "pessoal" ? "Ver fatura do sócio" : "Ver fatura aberta"}
          </Button>
          {podeGerir && (
            <Button size="sm" onClick={() => setComprando(c)}>
              {c.tipo === "pessoal" ? "Despesa paga com este cartão" : "Lançar compra"}
            </Button>
          )}
          {c.id !== cartaoAtual?.id && (
            <Button size="sm" variant="ghost" render={<Link href={`/financeiro/cartoes?cartao=${c.id}`} />}>
              Ver faturas
            </Button>
          )}
        </div>
      </LinhaComMenu>
    );
  }

  function renderFatura(f: FaturaDto) {
    const itens = itensDeFatura(
      { fimCiclo: f.fimCiclo, situacao: f.situacao, compras: { emAberto: f.comprasEmAberto, pagas: f.compras - f.comprasEmAberto } },
      { podeGerir, pessoal: cartaoAtual?.tipo === "pessoal", hoje },
    );
    const aoEscolher = (item: AcaoItemAcao) => void aoSelecionarFatura(f, item);
    const s = SITUACAO[f.situacao];
    return (
      <LinhaComMenu key={f.id} itens={itens} onSelect={aoEscolher} render={<tr className="border-b last:border-0 hover:bg-muted/20 data-[popup-open]:bg-muted/30" />}>
        <td className="px-4 py-2">
          <Link href={`/financeiro/cartoes/${cartaoAtual?.id}?fatura=${f.competencia}`} className="font-medium hover:underline">
            {rotuloDaCompetencia(f.competencia)}
          </Link>
        </td>
        <td className="px-4 py-2 text-xs text-muted-foreground">
          {formatarData(f.inicioCiclo)} a {formatarData(f.fimCiclo)}
        </td>
        <td className="px-4 py-2 font-mono text-xs">{formatarData(f.fimCiclo)}</td>
        <td className="px-4 py-2 font-mono text-xs">{formatarData(f.vencimento)}</td>
        <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{brl(f.totalCentavos / 100)}</td>
        <td className="px-4 py-2">
          <span className={`rounded-sm border px-1.5 py-0.5 text-xs ${s.classe}`}>
            {s.texto}
            {f.situacao === "paga" && f.ultimoPagamento ? ` ${formatarData(f.ultimoPagamento)}` : ""}
          </span>
        </td>
        <td className="px-2 py-2">
          <BotaoAcoes itens={itens} onSelect={aoEscolher} rotulo={`Ações da fatura de ${rotuloDaCompetencia(f.competencia)}`} className="size-8" />
        </td>
      </LinhaComMenu>
    );
  }
}
