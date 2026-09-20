"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { arquivarCampanha, reativarCampanha } from "@/modules/comercial/actions";
import type { CampanhaItem } from "@/modules/comercial/queries";
import { CampanhaDialog } from "./campanha-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { BarraSelecao } from "@/components/ui/barra-selecao";
import { Checkbox } from "@/components/ui/checkbox";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { useLote } from "@/components/ui/use-lote";
import { useSelecao } from "@/components/ui/use-selecao";
import { copiarTexto } from "@/lib/clipboard";
import {
  ACAO_ALTERNAR_ATIVO,
  ACAO_COPIAR_NOME,
  ACAO_EDITAR,
  ACAO_LOTE_ARQUIVAR,
  itensDeCadastroArquivavel,
  itensDeLoteArquivaveis,
} from "@/modules/comercial/acoes-cadastro";
import { brlInteiro, formatarData } from "@/lib/utils";

/**
 * Gestão de campanhas (F4.2) — mesma forma de `ParceirosView`. Vincular uma campanha a um lead
 * acontece no `lead-dialog.tsx` (Select, nunca texto livre); aqui só existe o catálogo e o
 * placar de quantas prospecções/negociações cada campanha já puxou.
 */
export function CampanhasView({
  campanhas,
  canais,
  responsaveis,
}: {
  campanhas: CampanhaItem[];
  canais: { id: string; nome: string }[];
  responsaveis: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  // Seleção compartilhada (ADR-0002, regra 3): o menu de contexto age sobre ela.
  const selecao = useSelecao();
  const lote = useLote();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<CampanhaItem | null>(null);

  function abrirNovo() {
    setEditando(null);
    setDialogAberto(true);
  }
  function abrirEdicao(c: CampanhaItem) {
    setEditando(c);
    setDialogAberto(true);
  }

  function alternarAtivo(c: CampanhaItem) {
    start(async () => {
      const r = c.ativo ? await arquivarCampanha({ id: c.id }) : await reativarCampanha({ id: c.id });
      if (r.ok) {
        toast.success(c.ativo ? "Campanha arquivada." : "Campanha reativada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  /** Marcados que ainda existem na lista (a lista muda quando algo é arquivado). */
  const alvosSelecao = campanhas.filter((x) => selecao.marcado(x.id));
  const itensDoLote = itensDeLoteArquivaveis(alvosSelecao);

  async function executarLote(item: AcaoItemAcao) {
    const arquivar = item.id === ACAO_LOTE_ARQUIVAR;
    // Quem já está no estado pedido sai do lote em vez de virar falha.
    const alvos = alvosSelecao.filter((x) => x.ativo === arquivar);
    const nomes = new Map(alvosSelecao.map((x) => [x.id, x.nome]));
    await lote.executar({
      ids: alvos.map((x) => x.id),
      acao: (id) => (arquivar ? arquivarCampanha({ id }) : reativarCampanha({ id })),
      substantivo: ["campanha", "campanhas"],
      verbo: arquivar ? ["arquivada", "arquivadas"] : ["reativada", "reativadas"],
      rotulo: (id) => nomes.get(id) ?? id,
      confirmar: {
        titulo: (n) => `${arquivar ? "Arquivar" : "Reativar"} ${n} ${n === 1 ? "campanha" : "campanhas"}?`,
      },
      aoConcluir: selecao.limpar,
    });
  }

  function aoSelecionarNaLinha(c: CampanhaItem, item: AcaoItemAcao) {
    if (item.id.startsWith("lote-")) {
      void executarLote(item);
      return;
    }
    if (item.id === ACAO_EDITAR) abrirEdicao(c);
    else if (item.id === ACAO_ALTERNAR_ATIVO) alternarAtivo(c);
    else if (item.id === ACAO_COPIAR_NOME) {
      void copiarTexto(c.nome).then((ok) => (ok ? toast.success("Nome copiado.") : toast.error("Não foi possível copiar o nome.")));
    }
  }

  return (
    <div className="space-y-4">
      <DicaMenuContexto />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/comercial" aria-label="Voltar" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold tracking-tight">Campanhas</h2>
          <p className="text-sm text-muted-foreground">
            Marketing/prospecção — vinculada a prospecções e negociações, com meta e período.
          </p>
        </div>
        <Button size="sm" onClick={abrirNovo}>
          <Plus className="size-4" /> Nova campanha
        </Button>
      </div>

      {campanhas.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Nenhuma campanha cadastrada"
          description="Cadastre para poder vincular a uma prospecção ou negociação."
          action={<Button size="sm" onClick={abrirNovo}>Nova campanha</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={selecao.estadoDaPagina(campanhas.map((x) => x.id)) === "todos"}
                    onCheckedChange={() => selecao.alternarPagina(campanhas.map((x) => x.id))}
                    aria-label="Marcar todos"
                  />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="text-right">Meta</TableHead>
                <TableHead className="text-right">Prospecções</TableHead>
                <TableHead className="text-right">Negociações</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campanhas.map((c) => {
                const menuItens = alvosSelecao.length > 1 && selecao.marcado(c.id)
                  ? itensDoLote
                  : itensDeCadastroArquivavel(c);
                return (
                <LinhaComMenu
                  key={c.id}
                  itens={menuItens}
                  onSelect={(item) => aoSelecionarNaLinha(c, item)}
                  aoAbrir={(aberto) => { if (aberto) selecao.aoAbrirMenu(c.id); }}
                  render={<TableRow data-marcada={selecao.marcado(c.id)} className={`data-[marcada=true]:bg-accent/40 data-[popup-open]:bg-muted/50 ${!c.ativo ? "opacity-60" : ""}`} />}
                >
                  <TableCell>
                    <Checkbox
                      checked={selecao.marcado(c.id)}
                      onCheckedChange={() => selecao.alternar(c.id)}
                      aria-label={`Selecionar ${c.nome}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.canal?.nome ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.periodoInicio ? formatarData(c.periodoInicio) : "—"}
                    {c.periodoFim ? ` – ${formatarData(c.periodoFim)}` : ""}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.responsavel?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {c.meta != null ? brlInteiro(Number(c.meta)) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">{c._count.leads}</TableCell>
                  <TableCell className="text-right font-mono">{c._count.negociacoes}</TableCell>
                  <TableCell>
                    <Badge variant={c.ativo ? "default" : "outline"}>
                      {c.ativo ? "Ativa" : "Arquivada"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <BotaoAcoes
                      itens={menuItens}
                      onSelect={(item) => aoSelecionarNaLinha(c, item)}
                      rotulo={`Ações de ${c.nome}`}
                    />
                  </TableCell>
                </LinhaComMenu>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <BarraSelecao
        total={alvosSelecao.length}
        itens={itensDoLote}
        onSelect={(item) => void executarLote(item)}
        onLimpar={selecao.limpar}
        substantivo={["campanha", "campanhas"]}
        genero="f"
        progresso={lote.progresso}
      />
      {lote.portal}

      <CampanhaDialog
        campanha={editando}
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        canais={canais}
        responsaveis={responsaveis}
      />
    </div>
  );
}
