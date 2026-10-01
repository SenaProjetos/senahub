"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { FolderOpen, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { BarraSelecao } from "@/components/ui/barra-selecao";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { useLote } from "@/components/ui/use-lote";
import { useSelecao } from "@/components/ui/use-selecao";
import { Valor } from "@/components/financeiro/valor";
import { ComparacaoCenarios, type ItemComparacao } from "@/components/financeiro/planejador/comparacao-cenarios";
import { copiarTexto } from "@/lib/clipboard";
import { formatarDataHora } from "@/lib/utils";
import { PRESETS, presetDosEixos } from "@/modules/financeiro/liquidez/cenario";
import { diaMes } from "@/modules/financeiro/liquidez/datas";
import {
  ACAO_ARQUIVAR,
  ACAO_COMPARAR,
  ACAO_COPIAR_LINK,
  ACAO_DUPLICAR,
  ACAO_EXCLUIR,
  ACAO_LOTE_ARQUIVAR,
  ACAO_LOTE_COMPARAR,
  ACAO_RENOMEAR,
  ACAO_RESTAURAR,
  hrefDoCenario,
  itensDeCenario,
  itensDeLoteCenarios,
  MAX_COMPARAR,
  type ContextoCenario,
} from "@/modules/financeiro/planejador/cenarios/acoes";
import {
  arquivarCenario,
  duplicarCenario,
  excluirCenario,
  renomearCenario,
  restaurarCenario,
} from "@/modules/financeiro/planejador/cenarios/actions";
import type { CenarioDto } from "@/modules/financeiro/planejador/cenarios/queries";
import type { ResumoCenario } from "@/modules/financeiro/planejador/cenarios/resumo";
import { cn } from "@/lib/utils";

export type LinhaCenario = CenarioDto & { resumo: ResumoCenario };

const COLUNAS = "grid grid-cols-[28px_minmax(13rem,1fr)_6.5rem_4.5rem_9.5rem_8.5rem_9.5rem_9.5rem_2rem] items-center gap-3";

function nomeDaBase(c: CenarioDto): string {
  const p = presetDosEixos(c.premissas.eixos);
  return p === "personalizado" ? "Personalizado" : (PRESETS.find((x) => x.id === p)?.nome ?? "—");
}

/** Situação na lista (mock): aplicado e arquivado vêm do cenário; o resto, da projeção de hoje. */
function situacaoDe(c: LinhaCenario): { texto: string; classe: string } {
  if (c.situacao === "arquivado") return { texto: "Arquivado", classe: "border-border text-muted-foreground" };
  if (c.situacao === "aplicado" && c.ajustes.length === 0 && c.aplicadoEm)
    return { texto: `Aplicado em ${diaMes(c.aplicadoEm.slice(0, 10))}`, classe: "border-success/50 text-success" };
  if (c.resumo.situacao === "deficit") return { texto: "Déficit", classe: "border-destructive/60 text-destructive" };
  if (c.resumo.situacao === "reserva") return { texto: "Abaixo da reserva", classe: "border-warning/60 text-warning" };
  return { texto: "Rascunho", classe: "border-border" };
}

/** Já aplicado e sem nada pendente: a simulação é igual à situação atual — os números não dizem nada. */
const semNumeros = (c: LinhaCenario) => c.situacao === "aplicado" && c.ajustes.length === 0;

function RenomearDialog({ cenario, onFechar }: { cenario: LinhaCenario | null; onFechar: () => void }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [pendente, iniciar] = useTransition();
  useEffect(() => {
    if (cenario) {
      setNome(cenario.nome);
      setDescricao(cenario.descricao ?? "");
    }
  }, [cenario]);

  function salvar() {
    if (!cenario) return;
    iniciar(async () => {
      const r = await renomearCenario({ id: cenario.id, nome, descricao });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Cenário renomeado.");
      onFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open={cenario !== null} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renomear cenário</DialogTitle>
          <DialogDescription>O nome e a descrição aparecem na lista e ao abrir no planejador.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rn-nome">Nome</Label>
            <Input id="rn-nome" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rn-desc">Descrição (opcional)</Label>
            <textarea
              id="rn-desc"
              value={descricao}
              maxLength={500}
              rows={2}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={pendente || !nome.trim()} onClick={salvar}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cenários salvos do planejador (mock "Cenários salvos"): lista com menu de contexto, `...` e seleção
 * (ADR-0002), comparação lado a lado e as abas Rascunhos e aplicados / Arquivados. Os números de
 * cada linha são recalculados sobre o financeiro de hoje (spec §11).
 */
export function CenariosView({
  cenarios,
  atual,
  caixaAtual,
  reservaMinima,
  arquivados,
  ctx,
  subnav,
}: {
  cenarios: LinhaCenario[];
  atual: ResumoCenario;
  caixaAtual: number;
  reservaMinima: number;
  arquivados: boolean;
  ctx: ContextoCenario;
  subnav?: React.ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const selecao = useSelecao();
  const lote = useLote();
  const [, iniciar] = useTransition();
  const [busca, setBusca] = useState("");
  const [comparando, setComparando] = useState<string[]>([]);
  const [renomear, setRenomear] = useState<LinhaCenario | null>(null);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    return q ? cenarios.filter((c) => `${c.nome} ${c.descricao ?? ""}`.toLocaleLowerCase("pt-BR").includes(q)) : cenarios;
  }, [busca, cenarios]);
  const porId = useMemo(() => new Map(cenarios.map((c) => [c.id, c])), [cenarios]);

  const executar = (promessa: Promise<{ ok: boolean; error?: string }>, sucesso: string) =>
    iniciar(async () => {
      const r = await promessa;
      if (!r.ok) return void toast.error(r.error ?? "Não foi possível.");
      toast.success(sucesso);
      router.refresh();
    });

  async function aoSelecionar(c: LinhaCenario, item: AcaoItemAcao) {
    // Confirmação SEMPRE antes da transição (React 19 suspenderia o diálogo dentro dela).
    if (item.confirmar && !(await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: item.variant === "destructive" ? "destructive" : "default" })))
      return;
    if (item.id === ACAO_COMPARAR) setComparando([c.id]);
    else if (item.id === ACAO_DUPLICAR) executar(duplicarCenario({ id: c.id }), `Cópia de “${c.nome}” criada.`);
    else if (item.id === ACAO_RENOMEAR) setRenomear(c);
    else if (item.id === ACAO_COPIAR_LINK) {
      if (await copiarTexto(`${window.location.origin}${hrefDoCenario(c.id)}`)) toast.success("Link copiado.");
      else toast.error("Não foi possível copiar.");
    } else if (item.id === ACAO_ARQUIVAR) executar(arquivarCenario({ id: c.id }), "Cenário arquivado.");
    else if (item.id === ACAO_RESTAURAR) executar(restaurarCenario({ id: c.id }), "Cenário restaurado.");
    else if (item.id === ACAO_EXCLUIR) executar(excluirCenario({ id: c.id }), "Cenário excluído.");
  }

  function aoSelecionarLote(item: AcaoItemAcao) {
    if (item.id === ACAO_LOTE_COMPARAR) setComparando(selecao.lista.slice(0, MAX_COMPARAR));
    else if (item.id === ACAO_LOTE_ARQUIVAR)
      void lote.executar({
        ids: selecao.lista,
        acao: (id) => arquivarCenario({ id }),
        substantivo: ["cenário", "cenários"],
        verbo: ["arquivado", "arquivados"],
        rotulo: (id) => porId.get(id)?.nome ?? id,
        aoConcluir: () => selecao.limpar(),
      });
  }

  const itensLote = itensDeLoteCenarios(selecao.total, ctx, arquivados);
  const comparacao: ItemComparacao[] = [
    { id: "__atual", nome: "Situação atual (Provável)", resumo: atual },
    ...comparando.flatMap((id) => {
      const c = porId.get(id);
      return c ? [{ id: c.id, nome: c.nome, resumo: c.resumo }] : [];
    }),
  ];

  const estadoPagina = selecao.estadoDaPagina(visiveis.map((c) => c.id));

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Cenários salvos"
        descricao="Simulações guardadas do planejador. Nenhuma altera o financeiro até ser aplicada."
        acoes={
          <Button size="sm" render={<Link href="/financeiro/planejador" />}>
            <Plus className="size-4" aria-hidden /> Novo no planejador
          </Button>
        }
      />
      {subnav}

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Situação" className="flex gap-1">
          <Button size="sm" variant={arquivados ? "outline" : "default"} aria-current={!arquivados ? "page" : undefined} render={<Link href="/financeiro/cenarios" />}>
            Rascunhos e aplicados
          </Button>
          <Button size="sm" variant={arquivados ? "default" : "outline"} aria-current={arquivados ? "page" : undefined} render={<Link href="/financeiro/cenarios?arquivados=1" />}>
            Arquivados
          </Button>
        </div>
        <div className="relative min-w-44 flex-1 sm:max-w-72">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Buscar cenário" placeholder="Buscar cenário" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" />
        </div>
      </div>

      <section aria-label="Cenários" className="rounded-sm border bg-card shadow-[var(--card-shadow)]">
        {visiveis.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={busca ? "Nenhum cenário com esse nome." : arquivados ? "Nenhum cenário arquivado." : "Nenhum cenário salvo ainda."}
            description={busca || arquivados ? undefined : "Simule no planejador e use “Salvar cenário” para guardar a simulação."}
            action={
              busca || arquivados ? undefined : (
                <Button size="sm" render={<Link href="/financeiro/planejador" />}>
                  Abrir o planejador
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="px-3 pt-2">
              <DicaMenuContexto />
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[68rem]">
                <div className={cn(COLUNAS, "border-b px-3 py-2 text-xs font-medium text-muted-foreground")}>
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos"
                    className="size-3.5"
                    checked={estadoPagina === "todos"}
                    ref={(el) => {
                      if (el) el.indeterminate = estadoPagina === "alguns";
                    }}
                    onChange={() => selecao.alternarPagina(visiveis.map((c) => c.id))}
                  />
                  <span>Cenário</span>
                  <span>Base</span>
                  <span className="text-right">Ajustes</span>
                  <span className="text-right">Menor saldo</span>
                  <span className="text-right">Saldo no fim</span>
                  <span>Situação</span>
                  <span>Atualizado</span>
                  <span className="sr-only">Ações</span>
                </div>
                {visiveis.map((c) => renderLinha(c))}
              </div>
            </div>
          </>
        )}
      </section>

      {comparando.length > 0 && (
        <ComparacaoCenarios itens={comparacao} caixaAtual={caixaAtual} reservaMinima={reservaMinima} onFechar={() => setComparando([])} />
      )}

      <BarraSelecao
        total={selecao.total}
        itens={itensLote}
        onSelect={aoSelecionarLote}
        onLimpar={selecao.limpar}
        substantivo={["cenário", "cenários"]}
        progresso={lote.progresso}
      />
      {lote.portal}
      <RenomearDialog cenario={renomear} onFechar={() => setRenomear(null)} />
    </div>
  );

  // Função de renderização, NÃO componente: um componente definido aqui dentro remontaria as linhas
  // a cada render e fecharia o menu de contexto aberto (ADR-0002).
  function renderLinha(c: LinhaCenario) {
    const itens = selecao.total > 1 && selecao.marcado(c.id) ? itensLote : itensDeCenario({ id: c.id, nome: c.nome, situacao: c.situacao, autorId: c.autor.id }, ctx);
    const aoEscolher = (item: AcaoItemAcao) => (item.id.startsWith("lote-") ? aoSelecionarLote(item) : void aoSelecionar(c, item));
    const sit = situacaoDe(c);
    const vazio = semNumeros(c);
    const r = c.resumo;
    return (
      <LinhaComMenu
        key={c.id}
        itens={itens}
        onSelect={aoEscolher}
        aoAbrir={(aberto) => {
          if (aberto) selecao.aoAbrirMenu(c.id);
        }}
        render={<div className={cn(COLUNAS, "border-b px-3 py-2.5 text-sm last:border-0 hover:bg-muted/30 data-[popup-open]:bg-muted/40")} />}
      >
        <input type="checkbox" className="size-3.5" aria-label={`Selecionar ${c.nome}`} checked={selecao.marcado(c.id)} onChange={() => selecao.alternar(c.id)} />
        <span className="min-w-0">
          <Link href={hrefDoCenario(c.id)} className="block truncate font-semibold hover:underline">
            {c.nome}
          </Link>
          {c.descricao && <span className="block truncate text-xs text-muted-foreground">{c.descricao}</span>}
        </span>
        <span className="text-[13px]">{nomeDaBase(c)}</span>
        <span className="text-right font-mono tabular-nums">{c.ajustes.length}</span>
        <span className="text-right">
          {vazio ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <>
              <Valor valor={r.menorSaldo / 100} sentido="neutro" className={cn(r.situacao === "deficit" && "text-destructive", r.situacao === "reserva" && "text-warning")} />
              <span className="block text-xs text-muted-foreground">{diaMes(r.diaMenor)}</span>
            </>
          )}
        </span>
        <span className="text-right">
          {vazio ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <>
              <Valor valor={r.saldoFinal / 100} sentido="neutro" />
              <span className="block text-xs text-muted-foreground">{diaMes(r.fim)}</span>
            </>
          )}
        </span>
        <span>
          <span className={cn("inline-block rounded-sm border px-1.5 py-0.5 text-xs font-medium", sit.classe)}>{sit.texto}</span>
        </span>
        <span className="min-w-0 text-xs text-muted-foreground">
          <span className="block">{formatarDataHora(c.atualizadoEm)}</span>
          <span className="block truncate">{c.autor.id === ctx.usuarioId ? "você" : c.autor.nome}</span>
        </span>
        <BotaoAcoes itens={itens} onSelect={aoEscolher} rotulo={`Ações do cenário ${c.nome}`} className="size-8" />
      </LinhaComMenu>
    );
  }
}
