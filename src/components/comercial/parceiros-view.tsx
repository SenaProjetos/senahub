"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, Plus } from "lucide-react";
import { arquivarParceiro, leadsDoParceiroAction, reativarParceiro } from "@/modules/comercial/actions";
import type { LeadDoParceiro, ParceiroItem } from "@/modules/comercial/queries";
import { STATUS_PROSPECCAO_LABEL } from "@/modules/comercial/prospeccao";
import { brl, formatarData } from "@/lib/utils";
import { ParceiroDialog } from "./parceiro-dialog";
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

export function ParceirosView({ parceiros }: { parceiros: ParceiroItem[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  // Seleção compartilhada (ADR-0002, regra 3): o menu de contexto age sobre ela.
  const selecao = useSelecao();
  const lote = useLote();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<ParceiroItem | null>(null);
  // Só uma linha expandida por vez (F7.11); cache por parceiro pra não rebuscar ao fechar/reabrir.
  const [expandido, setExpandido] = useState<string | null>(null);
  const [leadsPorParceiro, setLeadsPorParceiro] = useState<Record<string, LeadDoParceiro[]>>({});
  const [carregando, setCarregando] = useState<string | null>(null);

  function alternarExpansao(id: string) {
    if (expandido === id) {
      setExpandido(null);
      return;
    }
    setExpandido(id);
    if (leadsPorParceiro[id]) return;
    setCarregando(id);
    leadsDoParceiroAction(id)
      .then((leads) => setLeadsPorParceiro((m) => ({ ...m, [id]: leads })))
      .catch(() => {
        toast.error("Não foi possível carregar os leads deste parceiro.");
        setExpandido(null);
      })
      .finally(() => setCarregando(null));
  }

  function abrirNovo() {
    setEditando(null);
    setDialogAberto(true);
  }
  function abrirEdicao(p: ParceiroItem) {
    setEditando(p);
    setDialogAberto(true);
  }

  function alternarAtivo(p: ParceiroItem) {
    start(async () => {
      const r = p.ativo ? await arquivarParceiro({ id: p.id }) : await reativarParceiro({ id: p.id });
      if (r.ok) {
        toast.success(p.ativo ? "Parceiro arquivado." : "Parceiro reativado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  /** Marcados que ainda existem na lista (a lista muda quando algo é arquivado). */
  const alvosSelecao = parceiros.filter((x) => selecao.marcado(x.id));
  const itensDoLote = itensDeLoteArquivaveis(alvosSelecao);

  async function executarLote(item: AcaoItemAcao) {
    const arquivar = item.id === ACAO_LOTE_ARQUIVAR;
    // Quem já está no estado pedido sai do lote em vez de virar falha.
    const alvos = alvosSelecao.filter((x) => x.ativo === arquivar);
    const nomes = new Map(alvosSelecao.map((x) => [x.id, x.nome]));
    await lote.executar({
      ids: alvos.map((x) => x.id),
      acao: (id) => (arquivar ? arquivarParceiro({ id }) : reativarParceiro({ id })),
      substantivo: ["parceiro", "parceiros"],
      verbo: arquivar ? ["arquivado", "arquivados"] : ["reativado", "reativados"],
      rotulo: (id) => nomes.get(id) ?? id,
      confirmar: {
        titulo: (n) => `${arquivar ? "Arquivar" : "Reativar"} ${n} ${n === 1 ? "parceiro" : "parceiros"}?`,
      },
      aoConcluir: selecao.limpar,
    });
  }

  function aoSelecionarNaLinha(p: ParceiroItem, item: AcaoItemAcao) {
    if (item.id.startsWith("lote-")) {
      void executarLote(item);
      return;
    }
    if (item.id === ACAO_EDITAR) abrirEdicao(p);
    else if (item.id === ACAO_ALTERNAR_ATIVO) alternarAtivo(p);
    else if (item.id === ACAO_COPIAR_NOME) {
      void copiarTexto(p.nome).then((ok) => (ok ? toast.success("Nome copiado.") : toast.error("Não foi possível copiar o nome.")));
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
          <h2 className="text-2xl font-extrabold tracking-tight">Parceiros</h2>
          <p className="text-sm text-muted-foreground">
            Quem indica negócio — escolhido por lista no lead, nunca digitado (ADR-19).
          </p>
        </div>
        <Button size="sm" onClick={abrirNovo}>
          <Plus className="size-4" /> Novo parceiro
        </Button>
      </div>

      {parceiros.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Nenhum parceiro cadastrado"
          description="Cadastre para poder vincular a um lead."
          action={<Button size="sm" onClick={abrirNovo}>Novo parceiro</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={selecao.estadoDaPagina(parceiros.map((x) => x.id)) === "todos"}
                    onCheckedChange={() => selecao.alternarPagina(parceiros.map((x) => x.id))}
                    aria-label="Marcar todos"
                  />
                </TableHead>
                {/* Seta de expandir os leads indicados — coluna própria, para a marcação ficar
                    no mesmo lugar das outras tabelas. */}
                <TableHead className="w-8" />
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {parceiros.map((p) => {
                const menuItens = alvosSelecao.length > 1 && selecao.marcado(p.id)
                  ? itensDoLote
                  : itensDeCadastroArquivavel(p);
                const aberto = expandido === p.id;
                const temLeads = p._count.leads > 0;
                return (
                  <Fragment key={p.id}>
                    <LinhaComMenu
                      itens={menuItens}
                      onSelect={(item) => aoSelecionarNaLinha(p, item)}
                      aoAbrir={(aberto) => { if (aberto) selecao.aoAbrirMenu(p.id); }}
                      render={<TableRow data-marcada={selecao.marcado(p.id)} className={`data-[marcada=true]:bg-accent/40 data-[popup-open]:bg-muted/50 ${!p.ativo ? "opacity-60" : ""}`} />}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selecao.marcado(p.id)}
                          onCheckedChange={() => selecao.alternar(p.id)}
                          aria-label={`Selecionar ${p.nome}`}
                        />
                      </TableCell>
                      <TableCell>
                        {temLeads && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            aria-label={aberto ? `Recolher leads de ${p.nome}` : `Expandir leads de ${p.nome}`}
                            aria-expanded={aberto}
                            onClick={() => alternarExpansao(p.id)}
                          >
                            <ChevronRight className={`size-3.5 transition-transform ${aberto ? "rotate-90" : ""}`} />
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell>{p.tipo}</TableCell>
                      <TableCell className="font-mono text-xs">{p.documento ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.email || p.telefone || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">{p._count.leads}</TableCell>
                      <TableCell>
                        <Badge variant={p.ativo ? "default" : "outline"}>
                          {p.ativo ? "Ativo" : "Arquivado"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <BotaoAcoes
                          itens={menuItens}
                          onSelect={(item) => aoSelecionarNaLinha(p, item)}
                          rotulo={`Ações de ${p.nome}`}
                        />
                      </TableCell>
                    </LinhaComMenu>
                    {aberto && (
                      <TableRow>
                        <TableCell />
                        <TableCell />
                        <TableCell colSpan={7} className="bg-muted/30 py-3">
                          <LeadsDoParceiro leads={leadsPorParceiro[p.id]} carregando={carregando === p.id} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
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
        substantivo={["parceiro", "parceiros"]}
        progresso={lote.progresso}
      />
      {lote.portal}

      <ParceiroDialog parceiro={editando} open={dialogAberto} onOpenChange={setDialogAberto} />
    </div>
  );
}

function LeadsDoParceiro({ leads, carregando }: { leads: LeadDoParceiro[] | undefined; carregando: boolean }) {
  if (carregando) return <p className="text-xs text-muted-foreground">Carregando…</p>;
  if (!leads || leads.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum lead indicado.</p>;
  }
  return (
    <ul className="space-y-1">
      {leads.map((l) => (
        <li key={l.id}>
          <Link
            href={`/comercial/funil?card=LEAD:${l.id}`}
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-sm px-1.5 py-1 text-sm hover:bg-background"
          >
            <span className="font-medium">{l.cliente?.nome ?? l.nome}</span>
            <span className="text-xs text-muted-foreground">{l.nome}</span>
            <Badge variant="outline" className="text-[10px]">
              {STATUS_PROSPECCAO_LABEL[l.status]}
            </Badge>
            {l.valorEstimado != null && <span className="font-mono text-xs">{brl(l.valorEstimado)}</span>}
            <span className="ml-auto text-xs text-muted-foreground">{formatarData(l.createdAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
