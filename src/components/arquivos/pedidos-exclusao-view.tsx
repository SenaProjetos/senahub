"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Download, ExternalLink, FolderKanban, Trash2, ShieldX, Inbox } from "lucide-react";
import type { PedidoExclusaoPendente } from "@/modules/uploads/queries";
import { aprovarSolicitacaoExclusao, recusarSolicitacaoExclusao } from "@/modules/uploads/actions";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { formatarDataHora, rotuloRevisao } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DIAS_LIXEIRA } from "@/modules/uploads/lixeira";
import { Checkbox } from "@/components/ui/checkbox";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { AcoesMenuItens, BotaoAcoes } from "@/components/ui/acoes-menu";
import { BarraSelecao } from "@/components/ui/barra-selecao";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { useLote } from "@/components/ui/use-lote";
import { useSelecao } from "@/components/ui/use-selecao";
import { copiarTexto } from "@/lib/clipboard";
import { acimaDoTeto, motivoAcimaDoTeto } from "@/lib/lote";
import { ACAO_LOTE_EXCLUIR, ACAO_LOTE_MANTER, itensDeLotePedidosExclusao } from "@/modules/arquivos/acoes-lote";
import { Copy, FolderOpen } from "lucide-react";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Fila de pedidos de exclusão de arquivo (quem não pode excluir pediu; o admin decide).
 * Aprovar manda o arquivo para a lixeira do projeto; recusar mantém o arquivo e exige
 * um motivo, que volta para o solicitante na notificação.
 */
export function PedidosExclusaoView({ pedidos }: { pedidos: PedidoExclusaoPendente[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [recusando, setRecusando] = useState<PedidoExclusaoPendente | null>(null);
  // Recusa em lote: o mesmo motivo vale para todos os pedidos selecionados.
  const [recusandoLote, setRecusandoLote] = useState<PedidoExclusaoPendente[] | null>(null);
  const [motivo, setMotivo] = useState("");
  const selecao = useSelecao();
  const lote = useLote();

  // A fila encolhe quando algo é decidido: só conta o que ainda está nela.
  const selecionados = useMemo(() => pedidos.filter((p) => selecao.marcado(p.id)), [pedidos, selecao]);
  const emLote = selecionados.length > 1;
  const itensDoLote: AcaoItem[] = itensDeLotePedidosExclusao().map((i) =>
    i.tipo === "acao" && acimaDoTeto(selecionados.length)
      ? { ...i, desabilitado: motivoAcimaDoTeto(selecionados.length) }
      : i,
  );

  function aprovar(p: PedidoExclusaoPendente) {
    void (async () => {
      const ok = await confirm({
        title: "Aprovar exclusão?",
        description: `"${p.nome}" vai para a lixeira do projeto e pode ser restaurado por até ${DIAS_LIXEIRA} dias.`,
        confirmLabel: "Mover para a lixeira",
        variant: "destructive",
      });
      if (!ok) return;
      start(async () => {
        const r = await aprovarSolicitacaoExclusao({ id: p.id });
        if (r.ok) {
          toast.success("Exclusão aprovada — arquivo na lixeira.");
          router.refresh();
        } else toast.error(r.error);
      });
    })();
  }

  function confirmarRecusa() {
    if (!recusando) return;
    start(async () => {
      const r = await recusarSolicitacaoExclusao({ id: recusando.id, motivo });
      if (r.ok) {
        toast.success("Pedido recusado — arquivo mantido.");
        setRecusando(null);
        setMotivo("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function confirmarRecusaEmLote() {
    const alvos = recusandoLote;
    if (!alvos) return;
    const motivoDoLote = motivo;
    setRecusandoLote(null);
    setMotivo("");
    const nomes = new Map(alvos.map((a) => [a.id, a.nome]));
    await lote.executar({
      ids: alvos.map((a) => a.id),
      acao: (id) => recusarSolicitacaoExclusao({ id, motivo: motivoDoLote }),
      substantivo: ["pedido", "pedidos"],
      verbo: ["recusado", "recusados"],
      rotulo: (id) => nomes.get(id) ?? id,
      aoConcluir: selecao.limpar,
    });
  }

  async function executarLote(item: AcaoItemAcao) {
    if (selecionados.length === 0) return;
    if (acimaDoTeto(selecionados.length)) {
      toast.error(motivoAcimaDoTeto(selecionados.length));
      return;
    }
    if (item.id === ACAO_LOTE_MANTER) {
      // Abre o diálogo de motivo (que já é a confirmação); a ação roda ao confirmar.
      setMotivo("");
      setRecusandoLote(selecionados);
      return;
    }
    if (item.id === ACAO_LOTE_EXCLUIR) {
      const nomes = new Map(selecionados.map((s) => [s.id, s.nome]));
      await lote.executar({
        ids: selecionados.map((s) => s.id),
        acao: (id) => aprovarSolicitacaoExclusao({ id }),
        substantivo: ["arquivo", "arquivos"],
        verbo: ["enviado para a lixeira", "enviados para a lixeira"],
        rotulo: (id) => nomes.get(id) ?? id,
        confirmar: {
          titulo: (n) => `Excluir ${n} ${n === 1 ? "arquivo" : "arquivos"}?`,
          descricao: `Os arquivos vão para a lixeira do projeto e podem ser restaurados por até ${DIAS_LIXEIRA} dias.`,
          rotuloConfirmar: "Mover para a lixeira",
          destrutivo: true,
        },
        aoConcluir: selecao.limpar,
      });
    }
  }

  /** Menu de UM pedido: as duas decisões, mais o que repõe o menu nativo (baixar, copiar). */
  function menuDoPedido(p: PedidoExclusaoPendente) {
    const proprios: AcaoItem[] = [
      { tipo: "acao", id: "manter", rotulo: "Manter o arquivo", icone: ShieldX },
      { tipo: "acao", id: "excluir", rotulo: "Excluir", icone: Trash2, variant: "destructive" },
      { tipo: "separador", id: "sep" },
      ...(p.jaNaLixeira
        ? []
        : ([{ tipo: "link", id: "baixar", rotulo: "Baixar", icone: Download, href: p.downloadUrl }] as AcaoItem[])),
      { tipo: "acao", id: "copiar-nome", rotulo: "Copiar nome", icone: Copy },
      { tipo: "link", id: "abrir-pasta", rotulo: "Abrir a pasta do projeto", icone: FolderOpen, href: p.href },
    ];
    return {
      itens: emLote && selecao.marcado(p.id) ? itensDoLote : proprios,
      onSelect: (item: AcaoItemAcao) => {
        if (item.id.startsWith("lote-")) void executarLote(item);
        else if (item.id === "manter") {
          setMotivo("");
          setRecusando(p);
        } else if (item.id === "excluir") aprovar(p);
        else if (item.id === "copiar-nome") {
          void copiarTexto(p.nome).then((ok) =>
            ok ? toast.success("Nome copiado.") : toast.error("Não foi possível copiar o nome."),
          );
        }
      },
      aoAbrir: (aberto: boolean) => {
        if (aberto) selecao.aoAbrirMenu(p.id);
      },
    };
  }

  // Agrupa por projeto, igual à fila de validação, com atalho para a pasta.
  const grupos = useMemo(() => {
    const mapa = new Map<
      string,
      { projetoId: string; codigo: string; nome: string; href: string; itens: PedidoExclusaoPendente[] }
    >();
    for (const p of pedidos) {
      const g = mapa.get(p.projetoId) ?? {
        projetoId: p.projetoId,
        codigo: p.projetoCodigo,
        nome: p.projetoNome,
        href: p.href,
        itens: [],
      };
      g.itens.push(p);
      mapa.set(p.projetoId, g);
    }
    return [...mapa.values()];
  }, [pedidos]);

  if (pedidos.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nenhum pedido de exclusão"
        description="Quando alguém sem permissão pedir a exclusão de um arquivo, o pedido aparece aqui."
      />
    );
  }

  return (
    <div className="space-y-4">
      <DicaMenuContexto />

      {grupos.map((g) => (
        <div key={g.projetoId} className="rounded-lg border bg-card">
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <Checkbox
              className="shrink-0"
              checked={selecao.estadoDaPagina(g.itens.map((i) => i.id)) === "todos"}
              onCheckedChange={() => selecao.alternarPagina(g.itens.map((i) => i.id))}
              aria-label={`Selecionar todos os pedidos de ${g.nome}`}
            />
            <FolderKanban className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              <span className="font-mono text-muted-foreground">{formatarCodigo(g.codigo)}</span> · {g.nome}
            </span>
            <Badge variant="secondary" className="shrink-0">
              {g.itens.length}
            </Badge>
            <Link
              href={g.href}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-primary hover:bg-accent"
              title="Abrir a pasta do projeto"
            >
              <ExternalLink className="size-3.5" /> Abrir pasta
            </Link>
          </div>

          <ul className="divide-y">
            {g.itens.map((p) => {
              const menu = menuDoPedido(p);
              const marcado = selecao.marcado(p.id);
              const conteudo = (
                <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Checkbox
                    className="shrink-0"
                    checked={marcado}
                    onCheckedChange={() => selecao.alternar(p.id)}
                    aria-label={`Selecionar ${p.nome}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{p.nome}</span>
                      {p.versao > 1 && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">{rotuloRevisao(p.versao)}</span>
                      )}
                      {p.jaNaLixeira && (
                        <Badge variant="outline" className="shrink-0 text-muted-foreground">
                          já na lixeira
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.disciplina} · {fmtBytes(p.tamanho)} · pedido por {p.solicitante} ·{" "}
                      {formatarDataHora(p.criadoEm)}
                    </p>
                  </div>
                  {!p.jaNaLixeira && (
                    <Link
                      href={p.downloadUrl}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Baixar"
                      aria-label={`Baixar ${p.nome}`}
                    >
                      <Download className="size-4" />
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1"
                    disabled={pending}
                    onClick={() => {
                      setMotivo("");
                      setRecusando(p);
                    }}
                  >
                    <ShieldX className="size-3.5" /> Manter
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 shrink-0 gap-1"
                    disabled={pending}
                    onClick={() => aprovar(p)}
                  >
                    <Trash2 className="size-3.5" /> Excluir
                  </Button>
                  <BotaoAcoes
                    itens={menu.itens}
                    onSelect={menu.onSelect}
                    rotulo={`Ações do pedido de ${p.nome}`}
                    className="size-7"
                  />
                </div>
                <p className="rounded-sm bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Justificativa:</span> {p.justificativa}
                </p>
                </>
              );
              const classe = "space-y-1.5 px-3 py-2.5 data-[marcada=true]:bg-accent/40 data-[popup-open]:bg-muted/50";
              return (
                <ContextMenu key={p.id} onOpenChange={menu.aoAbrir}>
                  <ContextMenuTrigger render={<li className={classe} data-marcada={marcado} />}>
                    {conteudo}
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <AcoesMenuItens itens={menu.itens} onSelect={menu.onSelect} />
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </ul>
        </div>
      ))}

      <BarraSelecao
        total={selecionados.length}
        itens={itensDoLote}
        onSelect={(item) => void executarLote(item)}
        onLimpar={selecao.limpar}
        substantivo={["pedido", "pedidos"]}
        progresso={lote.progresso}
      />
      {lote.portal}

      <Dialog open={recusandoLote !== null} onOpenChange={(o) => !o && setRecusandoLote(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Manter {recusandoLote?.length} {recusandoLote?.length === 1 ? "arquivo" : "arquivos"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Os arquivos continuam nos projetos. O motivo abaixo vai para quem pediu cada exclusão.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="motivo-recusa-lote">Motivo (o mesmo para todos)</Label>
              <textarea
                id="motivo-recusa-lote"
                rows={3}
                maxLength={1000}
                className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRecusandoLote(null)}>
              Cancelar
            </Button>
            <Button disabled={motivo.trim().length < 5} onClick={() => void confirmarRecusaEmLote()}>
              Recusar pedidos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recusando !== null} onOpenChange={(o) => !o && setRecusando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manter o arquivo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {recusando?.nome} continua no projeto. O motivo abaixo vai para {recusando?.solicitante}.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="motivo-recusa">Motivo</Label>
              <textarea
                id="motivo-recusa"
                rows={3}
                maxLength={1000}
                className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                placeholder="Ex.: o arquivo ainda é a referência da revisão em andamento."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRecusando(null)}>
              Cancelar
            </Button>
            <Button disabled={pending || motivo.trim().length < 5} onClick={confirmarRecusa}>
              {pending ? "Salvando…" : "Recusar pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
