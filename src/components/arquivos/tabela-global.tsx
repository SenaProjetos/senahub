"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { AcoesMenuItens, BotaoAcoes } from "@/components/ui/acoes-menu";
import { BarraSelecao } from "@/components/ui/barra-selecao";
import { BotaoSelecionados } from "@/components/ui/botao-selecionados";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { useSelecao } from "@/components/ui/use-selecao";
import { BadgeExtensao } from "@/components/projetos/arquivos/badge-extensao";
import { useAcoesDocumento } from "@/components/projetos/arquivos/use-acoes-documento";
import { DisciplinaIcone } from "@/components/projetos/disciplina-icone";
import { copiarTexto } from "@/lib/clipboard";
import { acimaDoTeto, motivoAcimaDoTeto } from "@/lib/lote";
import { formatarData, formatarDataHora, rotuloRevisao } from "@/lib/utils";
import { MAX_ARQUIVOS_ZIP } from "@/modules/arquivos/arvore-global";
import { carregarDocumentosPorIds } from "@/modules/arquivos/actions";
import {
  ACAO_LOTE_COPIAR_NOMES,
  ACAO_LOTE_ZIP,
  itensDeLoteDiretorio,
  textoDosNomes,
  urlDoZip,
} from "@/modules/arquivos/acoes-lote";
import { documentoParaAcoes } from "@/modules/uploads/acoes-documento";
import type { LinhaDoc } from "@/modules/uploads/documentos-agrupados";

/**
 * Tabela do diretório geral — documentos de VÁRIOS projetos na mesma lista.
 *
 * Deliberadamente NÃO é a `TabelaDocumentos` da aba do projeto. Aquela é amarrada a um projeto
 * (catálogos de fase/tipo/status, listas de documentos, link público, edição de metadados) e
 * generalizá-la significaria carregar catálogo de N projetos para desenhar uma linha. Aqui o
 * escopo é achar o arquivo, abrir e baixar — inclusive em lote, pela seleção.
 *
 * O diretório geral é uma tela de CONSULTA: mostra o estado da validação, não deixa mudá-lo.
 * Validar (e desfazer) continua na aba do projeto, junto do contexto que a decisão exige —
 * apontamentos, revisão, entrega. O código do projeto em cada linha leva para lá.
 *
 * **Seleção (onda 2 do menu de contexto):** atravessa filtro e página. O que foi marcado num filtro
 * continua marcado quando o filtro muda, e "Selecionados (N)" mostra o conjunto inteiro — que não
 * está todo carregado, então vem do servidor, por id, com o escopo recalculado lá.
 */
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export type ProjetoDaLinha = { id: string; codigo: string; nome: string };

/** Resultado da visão "Selecionados", com a chave da seleção que o gerou. */
type Carregado = { chave: string; linhas: LinhaDoc[]; projetos: ProjetoDaLinha[] };

export function TabelaGlobalArquivos({
  linhas,
  projetos,
  podeCoordenacao,
  temFiltro,
  paginacao,
}: {
  linhas: LinhaDoc[];
  /** Código e nome por id — a linha só carrega `projetoId`. */
  projetos: Map<string, ProjetoDaLinha>;
  podeCoordenacao: boolean;
  temFiltro: boolean;
  /** A paginação mora aqui dentro para sumir na visão "Selecionados", que ignora as páginas. */
  paginacao?: { page: number; pageCount: number; pageSize: number; total: number };
}) {
  const selecao = useSelecao();
  const acoes = useAcoesDocumento({
    consulta: true,
    podeValidar: false,
    podeExcluir: false,
    podeSolicitarExclusao: false,
  });

  // ── visão "Selecionados": busca por id no servidor, ignorando os filtros da tela ──────────
  const chave = [...selecao.lista].sort().join(",");
  const [carregado, setCarregado] = useState<Carregado | null>(null);
  useEffect(() => {
    if (!selecao.soSelecionados) return;
    let vivo = true;
    void carregarDocumentosPorIds({ ids: selecao.lista }).then((r) => {
      if (!vivo) return;
      if (r.ok) setCarregado({ chave, linhas: r.data.linhas, projetos: r.data.projetos });
      else toast.error(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [selecao.soSelecionados, selecao.lista, chave]);

  const carregando = selecao.soSelecionados && carregado?.chave !== chave;
  const visaoSelecionados = selecao.soSelecionados && !carregando ? carregado : null;
  const linhasVisiveis = selecao.soSelecionados ? (visaoSelecionados?.linhas ?? []) : linhas;
  // Selecionado que sumiu (excluído, ou fora do escopo agora) não volta do servidor.
  const indisponiveis = visaoSelecionados ? selecao.total - visaoSelecionados.linhas.length : 0;

  const mapaProjetos = new Map(projetos);
  for (const p of visaoSelecionados?.projetos ?? []) mapaProjetos.set(p.id, p);

  const idsVisiveis = linhasVisiveis.map((l) => l.id);
  const todosMarcados = selecao.estadoDaPagina(idsVisiveis) === "todos";
  const foraDaTela = selecao.foraDaPagina(idsVisiveis);

  // ── ações ─────────────────────────────────────────────────────────────────────────────────
  const acimaDoLimite = acimaDoTeto(selecao.total);
  const itensDoLote: AcaoItem[] = itensDeLoteDiretorio().map((i) =>
    i.tipo === "acao" && acimaDoLimite ? { ...i, desabilitado: motivoAcimaDoTeto(selecao.total) } : i,
  );

  async function executarLote(id: string) {
    if (acimaDoLimite) {
      toast.error(motivoAcimaDoTeto(selecao.total));
      return;
    }
    // A seleção pode ter documento fora da tela: as linhas (e os arquivos de cada uma) vêm do servidor.
    const r = await carregarDocumentosPorIds({ ids: selecao.lista });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    const docs = r.data.linhas;
    if (docs.length === 0) {
      toast.error("Os documentos selecionados não estão mais disponíveis.");
      return;
    }
    const aviso = docs.length < selecao.total ? ` ${selecao.total - docs.length} não estava(m) mais disponível(is).` : "";

    if (id === ACAO_LOTE_ZIP) {
      const uploadIds = docs.flatMap((d) => d.arquivos.map((a) => a.id));
      if (uploadIds.length > MAX_ARQUIVOS_ZIP) {
        toast.error(`Seleção grande demais: ${uploadIds.length} arquivos, e o limite por download é ${MAX_ARQUIVOS_ZIP}.`);
        return;
      }
      window.location.href = urlDoZip(uploadIds);
      toast.success(`Baixando ${docs.length} ${docs.length === 1 ? "documento" : "documentos"} (${uploadIds.length} arquivos).${aviso}`);
    } else if (id === ACAO_LOTE_COPIAR_NOMES) {
      if (!(await copiarTexto(textoDosNomes(docs.map((d) => d.nome))))) {
        toast.error("Não foi possível copiar os nomes.");
        return;
      }
      toast.success(`${docs.length} ${docs.length === 1 ? "nome copiado" : "nomes copiados"}.${aviso}`);
    }
    selecao.limpar(); // a seleção é zerada ao concluir a ação em lote
  }

  /**
   * Itens de uma linha: com a linha DENTRO de uma seleção de vários, o menu age sobre a seleção
   * (regra 3 da ADR-0002); senão, só sobre a linha.
   */
  function itensDaLinha(linha: LinhaDoc): AcaoItem[] {
    if (selecao.total > 1 && selecao.marcado(linha.id)) return itensDoLote;
    const documento = documentoParaAcoes(linha);
    return documento ? acoes.itens(documento) : [];
  }

  function aoSelecionarNaLinha(linha: LinhaDoc, item: AcaoItemAcao) {
    if (item.id === ACAO_LOTE_ZIP || item.id === ACAO_LOTE_COPIAR_NOMES) {
      void executarLote(item.id);
      return;
    }
    const documento = documentoParaAcoes(linha);
    if (documento) acoes.aoSelecionar(documento, item);
  }

  /** Bind por linha: menu de contexto (botão direito / toque longo) e `...` leem a mesma lista. */
  function menuDaLinha(linha: LinhaDoc) {
    const itens = itensDaLinha(linha);
    return {
      itens,
      onSelect: (item: AcaoItemAcao) => aoSelecionarNaLinha(linha, item),
      // Botão direito fora da seleção: a linha passa a ser a seleção inteira (regra do explorador).
      aoAbrir: (aberto: boolean) => {
        if (aberto) selecao.aoAbrirMenu(linha.id);
      },
    };
  }

  if (linhas.length === 0 && !selecao.soSelecionados) {
    return (
      <>
        <EmptyState
          icon={FolderKanban}
          title="Nenhum documento encontrado"
          description={
            temFiltro
              ? "Ajuste a busca ou escolha outra pasta no painel."
              : "Os arquivos dos projetos aparecem aqui conforme forem enviados."
          }
        />
        {/* Sem linha na página, mas pode haver seleção vinda de outro filtro: o caminho de volta. */}
        <div className="mt-3 flex justify-end">
          <BotaoSelecionados total={selecao.total} ativo={false} onChange={selecao.verSelecionados} />
        </div>
        <BarraSelecao
          total={selecao.total}
          itens={itensDoLote}
          onSelect={(item) => void executarLote(item.id)}
          onLimpar={selecao.limpar}
          substantivo={["documento", "documentos"]}
        />
        {acoes.portal}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <DicaMenuContexto />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {selecao.soSelecionados
            ? carregando
              ? "Carregando os selecionados…"
              : "Mostrando só os selecionados, de todos os filtros."
            : foraDaTela > 0
              ? `${foraDaTela} ${foraDaTela === 1 ? "selecionado fora" : "selecionados fora"} desta lista.`
              : null}
        </p>
        <BotaoSelecionados total={selecao.total} ativo={selecao.soSelecionados} onChange={selecao.verSelecionados} />
      </div>

      {indisponiveis > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <span>
            {indisponiveis} {indisponiveis === 1 ? "documento selecionado não está" : "documentos selecionados não estão"} mais
            disponível(is) — foi excluído ou saiu do seu acesso.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => selecao.definir((visaoSelecionados?.linhas ?? []).map((l) => l.id))}
          >
            Tirar da seleção
          </Button>
        </div>
      )}

      {linhasVisiveis.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={carregando ? "Carregando…" : "Nada selecionado disponível"}
          description={carregando ? "Buscando os documentos selecionados." : "Os documentos selecionados não estão mais disponíveis."}
        />
      ) : (
        <>
          {/* Celular: um cartão por documento — a tabela sairia em rolagem lateral. Mesmo padrão
              já adotado na aba do projeto. O toque longo abre o menu. */}
          <ul className="overflow-hidden rounded-md border border-border bg-card md:hidden" aria-label="Documentos">
            {linhasVisiveis.map((linha) => (
              <CartaoGlobal
                key={linha.id}
                linha={linha}
                projeto={mapaProjetos.get(linha.projetoId)}
                podeCoordenacao={podeCoordenacao}
                marcada={selecao.marcado(linha.id)}
                onMarcar={() => selecao.alternar(linha.id)}
                menu={menuDaLinha(linha)}
              />
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-md border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={todosMarcados}
                      onCheckedChange={() => selecao.alternarPagina(idsVisiveis)}
                      aria-label={todosMarcados ? "Desmarcar todos" : "Marcar todos os documentos desta lista"}
                    />
                  </TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Disciplina</TableHead>
                  <TableHead>Fase</TableHead>
                  <TableHead>Rev.</TableHead>
                  <TableHead>Arquivos</TableHead>
                  <TableHead>Validação</TableHead>
                  <TableHead>Envio</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhasVisiveis.map((linha) => {
                  const projeto = mapaProjetos.get(linha.projetoId);
                  const menu = menuDaLinha(linha);
                  const marcada = selecao.marcado(linha.id);
                  const celulas = (
                    <>
                      <TableCell>
                        <Checkbox
                          checked={marcada}
                          onCheckedChange={() => selecao.alternar(linha.id)}
                          aria-label={`Selecionar ${linha.nome}`}
                        />
                      </TableCell>
                      <TableCell className="max-w-[22rem]">
                        <p className="truncate font-medium" title={linha.titulo ?? linha.tituloPrancha ?? linha.nome}>
                          {linha.titulo ?? linha.tituloPrancha ?? linha.nome}
                        </p>
                        {(linha.titulo ?? linha.tituloPrancha) && (
                          <p className="truncate font-mono text-xs text-muted-foreground" title={linha.nome}>
                            {linha.nome}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <LinkProjeto projeto={projeto} projetoId={linha.projetoId} />
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <DisciplinaIcone nome={linha.disciplinaNome} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate text-xs">{linha.disciplinaNome}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{linha.faseSigla ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {linha.revisaoAtual !== null ? rotuloRevisao(linha.revisaoAtual) : "—"}
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1">
                          {linha.arquivos.map((arquivo) => (
                            <BadgeExtensao
                              key={arquivo.id}
                              projetoId={linha.projetoId}
                              uploadId={arquivo.id}
                              nome={arquivo.nome}
                              ext={arquivo.ext}
                              downloadUrl={arquivo.downloadUrl}
                              podeCoordenacao={podeCoordenacao}
                            />
                          ))}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Validacao linha={linha} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        <span title={`${formatarDataHora(linha.atualizadoEm)} por ${linha.autor}`}>
                          {formatarData(linha.atualizadoEm)}
                        </span>
                        <span className="block">{fmtBytes(linha.tamanhoTotal)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {menu.itens.length > 0 && (
                          <BotaoAcoes itens={menu.itens} onSelect={menu.onSelect} rotulo={`Ações de ${linha.nome}`} className="size-7" />
                        )}
                      </TableCell>
                    </>
                  );

                  // Sem arquivo não há o que o menu repor: fica o menu nativo (ADR-0002).
                  if (menu.itens.length === 0) {
                    return (
                      <TableRow key={linha.id} data-marcada={marcada} className="data-[marcada=true]:bg-accent/40">
                        {celulas}
                      </TableRow>
                    );
                  }
                  return (
                    <ContextMenu key={linha.id} onOpenChange={menu.aoAbrir}>
                      <ContextMenuTrigger
                        render={
                          <TableRow
                            data-marcada={marcada}
                            className="data-[marcada=true]:bg-accent/40 data-[popup-open]:bg-muted/50"
                          />
                        }
                      >
                        {celulas}
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <AcoesMenuItens itens={menu.itens} onSelect={menu.onSelect} />
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {paginacao && !selecao.soSelecionados && paginacao.total > paginacao.pageSize && (
        <Pagination
          page={paginacao.page}
          pageCount={paginacao.pageCount}
          pageSize={paginacao.pageSize}
          total={paginacao.total}
        />
      )}

      <BarraSelecao
        total={selecao.total}
        itens={itensDoLote}
        onSelect={(item) => void executarLote(item.id)}
        onLimpar={selecao.limpar}
        substantivo={["documento", "documentos"]}
      />

      {acoes.portal}
    </div>
  );
}

function LinkProjeto({ projeto, projetoId }: { projeto: ProjetoDaLinha | undefined; projetoId: string }) {
  return (
    <Link
      href={`/projetos/${projetoId}/arquivos`}
      className="block max-w-[12rem] text-xs text-primary hover:underline"
      title={projeto ? `${projeto.codigo} · ${projeto.nome}` : undefined}
    >
      <span className="font-mono">{projeto?.codigo ?? "—"}</span>
      <span className="block truncate font-normal text-muted-foreground">{projeto?.nome ?? ""}</span>
    </Link>
  );
}

/**
 * Selo de validação, só leitura. É por ARQUIVO: um documento pode ter o PDF validado e o DWG
 * não, daí "Parcial". Arquivo em PastaProjeto (`validado: null`) não passa por validação.
 */
function Validacao({ linha }: { linha: LinhaDoc }) {
  const validaveis = linha.arquivos.filter((a) => a.validado !== null);
  if (validaveis.length === 0) {
    return (
      <span className="text-xs text-muted-foreground" title="Arquivos em pasta não passam por validação">
        —
      </span>
    );
  }
  const validados = validaveis.filter((a) => a.validado).length;
  if (validados === validaveis.length) {
    return (
      <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
        Validado
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {validados > 0 ? `Parcial (${validados}/${validaveis.length})` : "Pendente"}
    </Badge>
  );
}

function CartaoGlobal({
  linha,
  projeto,
  podeCoordenacao,
  marcada,
  onMarcar,
  menu,
}: {
  linha: LinhaDoc;
  projeto: ProjetoDaLinha | undefined;
  podeCoordenacao: boolean;
  marcada: boolean;
  onMarcar: () => void;
  menu: { itens: AcaoItem[]; onSelect: (item: AcaoItemAcao) => void; aoAbrir: (aberto: boolean) => void };
}) {
  const identificacao = [linha.faseSigla, linha.tipoSigla, linha.revisaoAtual !== null ? rotuloRevisao(linha.revisaoAtual) : null]
    .filter(Boolean)
    .join(" · ");

  const classe =
    "space-y-2 border-b border-border p-3 last:border-b-0 data-[marcada=true]:bg-accent/40 data-[popup-open]:bg-muted/50";

  const conteudo = (
    <>
      <div className="flex items-start gap-2">
        <Checkbox
          className="mt-0.5 shrink-0"
          checked={marcada}
          onCheckedChange={onMarcar}
          aria-label={`Selecionar ${linha.nome}`}
        />
        <DisciplinaIcone nome={linha.disciplinaNome} className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{linha.titulo ?? linha.tituloPrancha ?? linha.nome}</p>
          {(linha.titulo ?? linha.tituloPrancha) && (
            <p className="truncate font-mono text-xs text-muted-foreground" title={linha.nome}>
              {linha.nome}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            {projeto?.codigo ?? "—"} · {linha.disciplinaNome}
          </p>
        </div>
        {menu.itens.length > 0 && (
          <BotaoAcoes itens={menu.itens} onSelect={menu.onSelect} rotulo={`Ações de ${linha.nome}`} className="size-7" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-6">
        {identificacao && <span className="font-mono text-[11px] text-muted-foreground">{identificacao}</span>}
        <Validacao linha={linha} />
      </div>

      <div className="flex flex-wrap items-center gap-1 pl-6">
        {linha.arquivos.map((arquivo) => (
          <BadgeExtensao
            key={arquivo.id}
            projetoId={linha.projetoId}
            uploadId={arquivo.id}
            nome={arquivo.nome}
            ext={arquivo.ext}
            downloadUrl={arquivo.downloadUrl}
            podeCoordenacao={podeCoordenacao}
          />
        ))}
      </div>

      <p className="pl-6 text-[11px] text-muted-foreground">
        {formatarData(linha.atualizadoEm)} · {fmtBytes(linha.tamanhoTotal)} · {linha.autor}
      </p>
    </>
  );

  if (menu.itens.length === 0) {
    return (
      <li className={classe} data-marcada={marcada}>
        {conteudo}
      </li>
    );
  }

  return (
    <ContextMenu onOpenChange={menu.aoAbrir}>
      <ContextMenuTrigger render={<li className={classe} data-marcada={marcada} />}>{conteudo}</ContextMenuTrigger>
      <ContextMenuContent>
        <AcoesMenuItens itens={menu.itens} onSelect={menu.onSelect} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
