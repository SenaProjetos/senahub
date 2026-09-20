"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { FolderKanban, ExternalLink, Download, Eye, ClipboardCheck, AlertTriangle } from "lucide-react";
import type { PendenteAprovacao } from "@/modules/arquivos/queries";
import { AcoesValidacaoArquivo } from "@/components/projetos/acoes-validacao-arquivo";
import { useAcoesDocumento } from "@/components/projetos/arquivos/use-acoes-documento";
import { validarArquivo } from "@/modules/uploads/actions";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { copiarTexto } from "@/lib/clipboard";
import { acimaDoTeto, motivoAcimaDoTeto } from "@/lib/lote";
import { formatarDataHora, rotuloRevisao } from "@/lib/utils";
import { MAX_ARQUIVOS_ZIP } from "@/modules/arquivos/arvore-global";
import {
  ACAO_LOTE_APROVAR,
  ACAO_LOTE_COPIAR_NOMES,
  ACAO_LOTE_ZIP,
  itensDeLoteAprovacoes,
  textoDosNomes,
  urlDoZip,
} from "@/modules/arquivos/acoes-lote";
import { documentoParaAcoes } from "@/modules/uploads/acoes-documento";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { AcoesMenuItens, BotaoAcoes } from "@/components/ui/acoes-menu";
import { BarraSelecao } from "@/components/ui/barra-selecao";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { useLote } from "@/components/ui/use-lote";
import { useSelecao } from "@/components/ui/use-selecao";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";

const PACOTE_LABEL: Record<string, string> = {
  A: "Pranchas e arquivos",
  B: "Backup do modelo",
};

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const PDF_INLINE = (url: string) => `${url}?disposition=inline`;

/** Uma pendência é um Upload: cada linha tem exatamente um arquivo. */
function comoDocumento(a: PendenteAprovacao) {
  return documentoParaAcoes({
    projetoId: a.projetoId,
    revisaoAtual: a.versao,
    podeGerir: false,
    arquivos: [
      {
        id: a.id,
        nome: a.nome,
        ext: a.nome.includes(".") ? a.nome.slice(a.nome.lastIndexOf(".") + 1).toLowerCase() : "",
        downloadUrl: a.downloadUrl,
        validado: false,
      },
    ],
  });
}

export function AprovacoesView({ pendentes }: { pendentes: PendenteAprovacao[] }) {
  const selecao = useSelecao();
  const lote = useLote();
  // Consulta + validação: abre no projeto, baixa, copia, vê o histórico e valida / pede ajuste —
  // sem detalhes, renomear nem excluir (essas decisões são da aba do projeto).
  const acoes = useAcoesDocumento({
    consulta: true,
    podeValidar: true,
    podeExcluir: false,
    podeSolicitarExclusao: false,
  });

  // A fila encolhe quando algo é aprovado: só conta o que ainda está nela. Id que sobrou na
  // seleção depois do refresh não pode inflar o "N selecionados" nem entrar no lote.
  const selecionados = useMemo(() => pendentes.filter((p) => selecao.marcado(p.id)), [pendentes, selecao]);
  const emLote = selecionados.length > 1;
  const itensDoLote: AcaoItem[] = itensDeLoteAprovacoes().map((i) =>
    i.tipo === "acao" && acimaDoTeto(selecionados.length)
      ? { ...i, desabilitado: motivoAcimaDoTeto(selecionados.length) }
      : i,
  );

  async function executarLote(item: AcaoItemAcao) {
    if (selecionados.length === 0) return;
    if (acimaDoTeto(selecionados.length)) {
      toast.error(motivoAcimaDoTeto(selecionados.length));
      return;
    }

    if (item.id === ACAO_LOTE_APROVAR) {
      const nomes = new Map(selecionados.map((s) => [s.id, s.nome]));
      await lote.executar({
        ids: selecionados.map((s) => s.id),
        // A action de UM item: devolve o motivo de cada falha (apontamento em aberto…).
        acao: (id) => validarArquivo({ uploadId: id }),
        substantivo: ["arquivo", "arquivos"],
        verbo: ["aprovado", "aprovados"],
        rotulo: (id) => nomes.get(id) ?? id,
        confirmar: {
          titulo: (n) => `Aprovar ${n} ${n === 1 ? "arquivo" : "arquivos"}?`,
          descricao: item.confirmar?.descricao,
          rotuloConfirmar: item.confirmar?.rotuloConfirmar,
        },
        aoConcluir: selecao.limpar,
      });
      return;
    }

    if (item.id === ACAO_LOTE_ZIP) {
      if (selecionados.length > MAX_ARQUIVOS_ZIP) {
        toast.error(`Seleção grande demais: o limite por download é ${MAX_ARQUIVOS_ZIP} arquivos.`);
        return;
      }
      window.location.href = urlDoZip(selecionados.map((s) => s.id));
      toast.success(`Baixando ${selecionados.length} ${selecionados.length === 1 ? "arquivo" : "arquivos"}.`);
      selecao.limpar();
      return;
    }

    if (item.id === ACAO_LOTE_COPIAR_NOMES) {
      if (!(await copiarTexto(textoDosNomes(selecionados.map((s) => s.nome))))) {
        toast.error("Não foi possível copiar os nomes.");
        return;
      }
      toast.success(`${selecionados.length} ${selecionados.length === 1 ? "nome copiado" : "nomes copiados"}.`);
      selecao.limpar();
    }
  }

  /** Com a linha DENTRO de uma seleção de vários, o menu age sobre a seleção (ADR-0002, regra 3). */
  function menuDaLinha(a: PendenteAprovacao) {
    const documento = comoDocumento(a);
    const itens = emLote && selecao.marcado(a.id) ? itensDoLote : documento ? acoes.itens(documento) : [];
    return {
      itens,
      onSelect: (item: AcaoItemAcao) => {
        if (item.id.startsWith("lote-")) void executarLote(item);
        else if (documento) acoes.aoSelecionar(documento, item);
      },
      aoAbrir: (aberto: boolean) => {
        if (aberto) selecao.aoAbrirMenu(a.id);
      },
    };
  }

  // Agrupa por projeto — cada grupo tem o atalho direto para a pasta/projeto.
  const grupos = useMemo(() => {
    const mapa = new Map<string, { projetoId: string; codigo: string; nome: string; href: string; itens: PendenteAprovacao[] }>();
    for (const p of pendentes) {
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
  }, [pendentes]);

  if (pendentes.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Nenhuma aprovação pendente"
        description="Todos os entregáveis enviados já foram validados."
      />
    );
  }

  return (
    <div className="space-y-4">
      <DicaMenuContexto />

      {grupos.map((g) => {
        const idsDoGrupo = g.itens.map((a) => a.id);
        const todosSelecionados = selecao.estadoDaPagina(idsDoGrupo) === "todos";
        return (
          <div key={g.projetoId} className="rounded-lg border bg-card">
            <div className="flex items-center gap-2 border-b px-3 py-2.5">
              <Checkbox
                className="shrink-0"
                checked={todosSelecionados}
                onCheckedChange={() => selecao.alternarPagina(idsDoGrupo)}
                aria-label={`Selecionar todos os arquivos de ${g.nome}`}
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
              {g.itens.map((a) => {
                const inline = a.nome.toLowerCase().endsWith(".pdf");
                const menu = menuDaLinha(a);
                const linha = (
                  <>
                    <Checkbox
                      className="shrink-0"
                      checked={selecao.marcado(a.id)}
                      onCheckedChange={() => selecao.alternar(a.id)}
                      aria-label={`Selecionar ${a.nome}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{a.nome}</span>
                        {a.versao > 1 && <span className="shrink-0 text-[10px] text-muted-foreground">{rotuloRevisao(a.versao)}</span>}
                        {a.ajusteObs && (
                          <Badge variant="outline" className="shrink-0 gap-1 text-warning" title={a.ajusteObs}>
                            <AlertTriangle className="size-3" /> reenvio pós-ajuste
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.disciplina} · {PACOTE_LABEL[a.pacote] ?? a.pacote} · {a.autor} · {formatarDataHora(a.criadoEm)} ·{" "}
                        {fmtBytes(a.tamanho)}
                      </p>
                    </div>
                    {inline && (
                      <Link
                        href={PDF_INLINE(a.downloadUrl)}
                        target="_blank"
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        title="Abrir"
                        aria-label={`Abrir ${a.nome}`}
                      >
                        <Eye className="size-4" />
                      </Link>
                    )}
                    <Link
                      href={a.downloadUrl}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Baixar"
                      aria-label={`Baixar ${a.nome}`}
                    >
                      <Download className="size-4" />
                    </Link>
                    <AcoesValidacaoArquivo uploadId={a.id} nomeArquivo={a.nome} validado={false} />
                    {menu.itens.length > 0 && (
                      <BotaoAcoes itens={menu.itens} onSelect={menu.onSelect} rotulo={`Ações de ${a.nome}`} className="size-7" />
                    )}
                  </>
                );
                const classe =
                  "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 data-[marcada=true]:bg-accent/40 data-[popup-open]:bg-muted/50";

                if (menu.itens.length === 0) {
                  return (
                    <li key={a.id} className={classe} data-marcada={selecao.marcado(a.id)}>
                      {linha}
                    </li>
                  );
                }
                return (
                  <ContextMenu key={a.id} onOpenChange={menu.aoAbrir}>
                    <ContextMenuTrigger render={<li className={classe} data-marcada={selecao.marcado(a.id)} />}>
                      {linha}
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <AcoesMenuItens itens={menu.itens} onSelect={menu.onSelect} />
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </ul>
          </div>
        );
      })}

      <BarraSelecao
        total={selecionados.length}
        itens={itensDoLote}
        onSelect={(item) => void executarLote(item)}
        onLimpar={selecao.limpar}
        substantivo={["arquivo", "arquivos"]}
        progresso={lote.progresso}
      />

      {acoes.portal}
      {lote.portal}
    </div>
  );
}
