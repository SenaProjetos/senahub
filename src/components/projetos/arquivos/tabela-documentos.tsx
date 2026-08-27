"use client";

import { useMemo, useState } from "react";
import { FileX2, SearchX } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableHead } from "@/components/ui/sortable-head";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { BarraSelecaoDocumentos } from "@/components/projetos/arquivos/barra-selecao-documentos";
import type { ListaPainel } from "@/components/projetos/arquivos/painel-listas";
import { DisciplinaIcone } from "@/components/projetos/disciplina-icone";
import { BadgeExtensao } from "@/components/projetos/arquivos/badge-extensao";
import { MenuDocumento } from "@/components/projetos/arquivos/menu-documento";
import { PainelDocumentoDetalhe, type OpcaoStatusDocumento } from "@/components/projetos/arquivos/painel-documento-detalhe";
import type { OpcaoFaseDocumento } from "@/components/projetos/arquivos/seletor-fases-documentos";
import type { LinhaDoc } from "@/modules/uploads/documentos-agrupados";
import type { LinhaDocumento } from "@/modules/uploads/lista-documentos";
import { formatarData, rotuloRevisao } from "@/lib/utils";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function estadoValidacao(arquivos: LinhaDoc["arquivos"]): "validado" | "pendente" | "parcial" | null {
  const validaveis = arquivos.filter((a) => a.validado !== null);
  if (validaveis.length === 0) return null;
  if (validaveis.every((a) => a.validado)) return "validado";
  if (validaveis.every((a) => !a.validado)) return "pendente";
  return "parcial";
}

/** O menu legado ainda recebe um Upload; o primeiro arquivo da revisão vigente o ancora. */
function linhaParaMenu(linha: LinhaDoc): LinhaDocumento | null {
  const arquivo = linha.arquivos[0];
  if (!arquivo) return null;
  return {
    id: arquivo.id,
    nome: arquivo.nome,
    ext: arquivo.ext,
    disciplinaId: linha.disciplinaId,
    disciplinaNome: linha.disciplinaNome,
    versao: linha.revisaoAtual ?? 0,
    validado: arquivo.validado,
    autor: linha.autor,
    data: linha.atualizadoEm,
    tamanho: linha.tamanhoTotal,
    downloadUrl: arquivo.downloadUrl,
    podeGerir: linha.podeGerir,
  };
}

/**
 * Tabela densa de documentos (F1-PR3 + paginação server-side em F1-PR10).
 *
 * Usa o `Table` do design system, não markup custom: a auditoria (02-matriz-gap.md, D5)
 * confirmou que o componente não tem limitação técnica — já é usado em 38 telas densas do
 * sistema e já trata checkbox de linha.
 *
 * A unidade da tabela é o DocumentoDisciplina. Os arquivos da revisão vigente aparecem como
 * badges na mesma linha — por exemplo, PDF e DWG da mesma prancha.
 *
 * Ordenação e paginação são do BANCO: `SortableHead`/`Pagination` só escrevem na URL
 * (`?sort=&dir=&page=`) e o servidor devolve a página pronta. Nada de fatiar em memória —
 * um projeto com milhares de arquivos nunca chega inteiro ao navegador.
 */
export function TabelaDocumentos({
  projetoId,
  linhas,
  filtradaPorDisciplina,
  filtradaPorLista,
  temFiltroAtivo,
  podeCoordenacao,
  podeValidar,
  podeExcluir,
  podeSolicitarExclusao,
  podeGerirListas,
  podeGerirLink,
  listas,
  listaSelecionadaId,
  fases,
  status,
  colunas,
  exclusoesPendentes,
}: {
  projetoId: string;
  linhas: LinhaDoc[];
  filtradaPorDisciplina: boolean;
  filtradaPorLista: boolean;
  temFiltroAtivo: boolean;
  podeCoordenacao: boolean;
  podeValidar: boolean;
  podeExcluir: boolean;
  podeSolicitarExclusao: boolean;
  podeGerirListas: boolean;
  /** Espelho do gate de `projetos:gerir`; o servidor revalida na action. */
  podeGerirLink: boolean;
  listas: ListaPainel[];
  listaSelecionadaId: string | null;
  fases: OpcaoFaseDocumento[];
  status: OpcaoStatusDocumento[];
  /** Ids das colunas que o usuário escolheu ver (resolvido no servidor). */
  colunas: Set<string>;
  /** Ids de Upload com pedido de exclusão pendente — sinal na linha do documento dono. */
  exclusoesPendentes: Set<string>;
}) {
  // A página já vem ordenada e recortada do banco (F1-PR10) — o `SortableHead` só empurra
  // `?sort=&dir=` para a URL, e a query do servidor faz o trabalho.
  const ordenadas = linhas;

  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  // Só conta o que ainda está na tela: trocar de disciplina (ou filtrar, em F1-PR7) troca as
  // linhas, e uma seleção fantasma de linha invisível viraria ação em lote surpresa.
  const documentosSelecionados = useMemo(
    () => ordenadas.filter((l) => selecao.has(l.id)),
    [ordenadas, selecao],
  );
  // As ações existentes trabalham com Upload. Selecionar um documento inclui todos os
  // arquivos da revisão vigente, sem atingir revisões históricas.
  const selecionados = useMemo(
    () => documentosSelecionados.flatMap((l) => l.arquivos.map((a) => a.id)),
    [documentosSelecionados],
  );
  const validaveis = useMemo(
    () => documentosSelecionados.flatMap((l) => l.arquivos).filter((a) => a.validado === false).length,
    [documentosSelecionados],
  );
  const todasMarcadas = ordenadas.length > 0 && documentosSelecionados.length === ordenadas.length;

  function alternar(id: string) {
    setSelecao((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(id)) proxima.delete(id);
      else proxima.add(id);
      return proxima;
    });
  }

  function alternarTodas() {
    setSelecao(todasMarcadas ? new Set() : new Set(ordenadas.map((l) => l.id)));
  }

  if (ordenadas.length === 0) {
    // Três vazios diferentes: filtro sem resultado, disciplina sem arquivo, projeto sem nada.
    // O usuário precisa saber qual dos três é para agir certo (limpar filtro vs. enviar arquivo).
    const vazio = temFiltroAtivo
      ? {
          title: "Nenhum documento encontrado",
          description: "Nenhum documento corresponde à busca e aos filtros aplicados. Remova um filtro para ampliar o resultado.",
        }
      : filtradaPorDisciplina
        ? {
            title: "Nenhum documento nesta disciplina",
            description: "Selecione outra disciplina no painel ao lado ou envie o primeiro arquivo.",
          }
        : filtradaPorLista
          ? {
              title: "Nenhum documento nesta lista",
              description: "Selecione outra lista no painel ao lado ou adicione documentos a esta lista.",
            }
        : {
            title: "Nenhum documento neste projeto",
            description: "Envie o primeiro arquivo para começar.",
          };
    return (
      <div className="rounded-md border border-border bg-card">
        <EmptyState icon={temFiltroAtivo ? SearchX : FileX2} title={vazio.title} description={vazio.description} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-9">
              <Checkbox
                checked={todasMarcadas}
                onCheckedChange={alternarTodas}
                aria-label={todasMarcadas ? "Limpar seleção" : "Selecionar todos os documentos da lista"}
              />
            </TableHead>
            <SortableHead field="disciplina">Disciplina</SortableHead>
            <SortableHead field="nome">Documento</SortableHead>
            {colunas.has("revisao") && <SortableHead field="revisao" className="text-right">Revisão</SortableHead>}
            {colunas.has("validado") && <TableHead>Validado</TableHead>}
            {colunas.has("extensao") && <TableHead>Extensão</TableHead>}
            {colunas.has("responsavel") && <TableHead>Responsável</TableHead>}
            {colunas.has("data") && <SortableHead field="data">Atualizado</SortableHead>}
            {colunas.has("tamanho") && <SortableHead field="tamanho" className="text-right">Tamanho</SortableHead>}
            <TableHead className="w-10"><span className="sr-only">Ações</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenadas.map((l) => {
            const validacao = estadoValidacao(l.arquivos);
            const linhaMenu = linhaParaMenu(l);
            return (
            <TableRow key={l.id} data-state={selecao.has(l.id) ? "selected" : undefined}>
              <TableCell>
                <Checkbox
                  checked={selecao.has(l.id)}
                  onCheckedChange={() => alternar(l.id)}
                  aria-label={`Selecionar ${l.nome}`}
                />
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  <DisciplinaIcone nome={l.disciplinaNome} className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{l.disciplinaNome}</span>
                </span>
              </TableCell>
              <TableCell className="max-w-[22rem] whitespace-normal">
                <div className="space-y-1">
                  <PainelDocumentoDetalhe linha={l} fases={fases} status={status} />
                  {(l.faseSigla || l.statusNome || l.arquivos.some((a) => exclusoesPendentes.has(a.id))) && (
                    <div className="flex flex-wrap items-center gap-1">
                      {/* Alguém pediu a exclusão de um arquivo deste documento e um admin ainda
                          não decidiu — o arquivo continua valendo, mas quem olha a lista
                          precisa saber que há um pedido em aberto. */}
                      {l.arquivos.some((a) => exclusoesPendentes.has(a.id)) && (
                        <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
                          exclusão solicitada
                        </Badge>
                      )}
                      {l.faseSigla && (
                        <Badge variant="secondary" title={l.faseNome ?? undefined}>
                          {l.faseSigla}
                        </Badge>
                      )}
                      {l.statusNome && (
                        <Badge variant="outline" title={l.statusFinal ? "Status final" : undefined}>
                          {l.statusNome}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </TableCell>
              {colunas.has("revisao") && (
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {l.revisaoAtual === null ? "—" : rotuloRevisao(l.revisaoAtual)}
                </TableCell>
              )}
              {colunas.has("validado") && (
                <TableCell>
                  {validacao === null ? (
                    <span className="text-xs text-muted-foreground" title="Arquivos em pasta não passam por validação">
                      —
                    </span>
                  ) : validacao === "validado" ? (
                    <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                      Validado
                    </Badge>
                  ) : validacao === "parcial" ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      Parcial
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Pendente
                    </Badge>
                  )}
                </TableCell>
              )}
              {colunas.has("extensao") && (
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {l.arquivos.map((arquivo) => (
                      <BadgeExtensao
                        key={arquivo.id}
                        projetoId={projetoId}
                        uploadId={arquivo.id}
                        nome={arquivo.nome}
                        ext={arquivo.ext}
                        downloadUrl={arquivo.downloadUrl}
                        podeCoordenacao={podeCoordenacao}
                      />
                    ))}
                  </div>
                </TableCell>
              )}
              {colunas.has("responsavel") && <TableCell className="text-muted-foreground">{l.autor}</TableCell>}
              {colunas.has("data") && (
                <TableCell className="tabular-nums text-muted-foreground">{formatarData(l.atualizadoEm)}</TableCell>
              )}
              {colunas.has("tamanho") && (
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmtBytes(l.tamanhoTotal)}
                </TableCell>
              )}
              <TableCell className="text-right">
                {linhaMenu && (
                  <MenuDocumento
                    projetoId={projetoId}
                    linha={linhaMenu}
                    podeValidar={podeValidar}
                    podeExcluir={podeExcluir}
                    podeSolicitarExclusao={podeSolicitarExclusao}
                  />
                )}
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>

      <BarraSelecaoDocumentos
        projetoId={projetoId}
        selecionados={selecionados}
        documentoIds={documentosSelecionados.map((documento) => documento.id)}
        totalDocumentosSelecionados={documentosSelecionados.length}
        totalValidaveis={validaveis}
        podeValidar={podeValidar}
        podeExcluir={podeExcluir}
        podeGerirListas={podeGerirListas}
        podeGerirLink={podeGerirLink}
        listas={listas}
        listaSelecionadaId={listaSelecionadaId}
        onLimpar={() => setSelecao(new Set())}
      />
    </div>
  );
}
