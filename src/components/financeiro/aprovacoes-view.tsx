"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { aprovarLancamento, rejeitarLancamento } from "@/modules/financeiro/aprovacao/actions";
import { ACAO_APROVAR, ACAO_REJEITAR, itensDeAprovacao } from "@/modules/financeiro/aprovacao/acoes";
import { formatarCodigo } from "@/modules/projetos/numbering";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { BarraSelecao } from "@/components/ui/barra-selecao";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { useLote } from "@/components/ui/use-lote";
import { useSelecao } from "@/components/ui/use-selecao";
import { brl, formatarData } from "@/lib/utils";

type Item = {
  id: string;
  descricao: string;
  valor: number;
  categoria: string;
  fornecedor: string | null;
  projeto: string | null;
  autor: string;
  vencimento: string | null;
  criadoEm: string;
  /** Regra do servidor: por que quem está na tela não pode decidir (`null` = pode). */
  bloqueio: string | null;
};

/**
 * Aprovações financeiras. Cada linha tem menu de contexto, `...` e entra na barra de seleção
 * (ADR-0002, pelo descritor puro `itensDeAprovacao`); aprovar em lote repete a MESMA action item a
 * item. Rejeitar abre um diálogo pedindo o motivo — ele vai para quem lançou, então não pode ser um
 * `window.prompt`, que o lote não saberia preencher.
 */
export function AprovacoesView({
  itens,
  podeGerir,
  podeAprovar,
  subnav,
}: {
  itens: Item[];
  podeGerir: boolean;
  podeAprovar: boolean;
  subnav?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [recusa, setRecusa] = useState<{ item: Item; motivo: string } | null>(null);
  const selecao = useSelecao();
  const lote = useLote();

  const ids = useMemo(() => itens.map((i) => i.id), [itens]);
  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const estado = selecao.estadoDaPagina(ids);

  function aprovar(id: string) {
    start(async () => {
      const r = await aprovarLancamento({ id });
      if (r.ok) {
        toast.success("Despesa aprovada.");
        selecao.limpar();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function confirmarRecusa() {
    if (!recusa || !recusa.motivo.trim()) return;
    const { item, motivo } = recusa;
    start(async () => {
      const r = await rejeitarLancamento({ id: item.id, motivo });
      if (r.ok) {
        toast.success("Despesa rejeitada. Quem lançou foi avisado.");
        setRecusa(null);
        selecao.limpar();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function aoSelecionar(item: Item, acao: AcaoItemAcao) {
    if (acao.id === ACAO_APROVAR) aprovar(item.id);
    else if (acao.id === ACAO_REJEITAR) setRecusa({ item, motivo: "" });
  }

  /** Lote: só aprovar. Rejeitar exige um motivo por despesa — em lote viraria um motivo falso. */
  function aprovarSelecionadas(alvos: readonly string[]) {
    void lote.executar({
      ids: alvos.filter((id) => porId.get(id)?.bloqueio === null),
      acao: (id) => aprovarLancamento({ id }),
      substantivo: ["despesa", "despesas"],
      verbo: ["aprovada", "aprovadas"],
      rotulo: (id) => porId.get(id)?.descricao ?? id,
      confirmar: {
        titulo: (n) => (n === 1 ? "Aprovar 1 despesa?" : `Aprovar ${n} despesas?`),
        descricao: "Elas passam a contar como contas a pagar em aberto.",
        rotuloConfirmar: "Aprovar",
      },
      aoConcluir: () => selecao.limpar(),
    });
  }

  const itensDaBarra = podeAprovar ? [{ tipo: "acao" as const, id: ACAO_APROVAR, rotulo: "Aprovar selecionadas" }] : [];

  // Função de render (não componente aninhado): um componente definido aqui dentro remontaria a
  // cada render e fecharia o menu aberto (ADR-0002).
  function linha(l: Item) {
    const acoes = itensDeAprovacao({ id: l.id, bloqueio: l.bloqueio }, { podeAprovar });
    return (
      <LinhaComMenu
        key={l.id}
        itens={acoes}
        onSelect={(item) => aoSelecionar(l, item)}
        aoAbrir={(aberto) => {
          if (aberto) selecao.aoAbrirMenu(l.id);
        }}
        render={<tr className="hover:bg-muted/40 data-[popup-open]:bg-muted/30" />}
      >
        {podeAprovar && (
          <td className="px-3 py-2">
            <Checkbox checked={selecao.marcado(l.id)} onCheckedChange={() => selecao.alternar(l.id)} aria-label={`Selecionar ${l.descricao}`} />
          </td>
        )}
        <td className="px-4 py-2">
          <span className="font-medium">{l.descricao}</span>
          <span className="block text-xs text-muted-foreground">
            {l.fornecedor ?? "—"}
            {l.projeto ? ` · ${formatarCodigo(l.projeto)}` : ""}
            {l.vencimento ? ` · vence ${formatarData(l.vencimento + "T00:00:00")}` : ""}
          </span>
        </td>
        <td className="px-4 py-2 text-muted-foreground">{l.categoria}</td>
        <td className="px-4 py-2 text-muted-foreground">{l.autor}</td>
        <td className="px-4 py-2 text-right font-mono font-semibold">{brl(l.valor)}</td>
        <td className="px-4 py-2 text-right">
          <BotaoAcoes itens={acoes} onSelect={(item) => aoSelecionar(l, item)} rotulo={`Ações de ${l.descricao}`} className="size-8" />
        </td>
      </LinhaComMenu>
    );
  }

  return (
    <div className="space-y-5">
      <CabecalhoPagina titulo="Aprovações financeiras" descricao="Despesas acima da alçada aguardando liberação." />
      {subnav}

      {podeGerir && (
        <p className="text-sm text-muted-foreground">
          As faixas de valor e quem aprova cada uma ficam em{" "}
          <Link href="/financeiro/configuracoes" className="font-medium text-foreground underline underline-offset-2">
            Configurações do financeiro
          </Link>
          . Vale o total do parcelamento, e quem lançou não aprova a própria despesa (só o admin).
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {itens.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="Nenhuma despesa aguardando aprovação." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  <tr>
                    {podeAprovar && (
                      <th className="w-10 px-3 py-2">
                        <Checkbox
                          checked={estado === "todos"}
                          indeterminate={estado === "alguns"}
                          onCheckedChange={() => selecao.alternarPagina(ids)}
                          aria-label="Selecionar todas as despesas da lista"
                        />
                      </th>
                    )}
                    <th className="px-4 py-2">Descrição</th>
                    <th className="px-4 py-2">Categoria</th>
                    <th className="px-4 py-2">Solicitante</th>
                    <th className="px-4 py-2 text-right">Valor</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">{itens.map((l) => linha(l))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <BarraSelecao
        total={selecao.total}
        itens={itensDaBarra}
        onSelect={() => aprovarSelecionadas(selecao.lista)}
        onLimpar={selecao.limpar}
        substantivo={["despesa", "despesas"]}
        genero="f"
        progresso={lote.progresso}
      />
      {lote.portal}

      <Dialog open={recusa !== null} onOpenChange={(aberto) => !aberto && setRecusa(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar a despesa</DialogTitle>
            <DialogDescription>
              {recusa ? `${recusa.item.descricao} · ${brl(recusa.item.valor)}. O motivo vai para ${recusa.item.autor}.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="motivo-recusa">Motivo</Label>
            <Input
              id="motivo-recusa"
              autoFocus
              value={recusa?.motivo ?? ""}
              maxLength={300}
              onChange={(e) => setRecusa((r) => (r ? { ...r, motivo: e.target.value } : r))}
              placeholder="Diga o que precisa mudar para ser aprovada"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusa(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={pending || !recusa?.motivo.trim()} onClick={confirmarRecusa}>
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
