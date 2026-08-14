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
import { DisciplinaIcone } from "@/components/projetos/disciplina-icone";
import { BadgeExtensao } from "@/components/projetos/arquivos/badge-extensao";
import { MenuDocumento } from "@/components/projetos/arquivos/menu-documento";
import type { LinhaDocumento } from "@/modules/uploads/lista-documentos";
import { formatarData, rotuloRevisao } from "@/lib/utils";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Tabela densa de documentos (F1-PR3 + paginação server-side em F1-PR10).
 *
 * Usa o `Table` do design system, não markup custom: a auditoria (02-matriz-gap.md, D5)
 * confirmou que o componente não tem limitação técnica — já é usado em 38 telas densas do
 * sistema e já trata checkbox de linha.
 *
 * Fase 1 = uma linha POR ARQUIVO. Agrupar PDF+DWG da mesma prancha numa linha só depende do
 * merge de chave da Fase 2 (D1) — não é simulado aqui.
 *
 * Ordenação e paginação são do BANCO: `SortableHead`/`Pagination` só escrevem na URL
 * (`?sort=&dir=&page=`) e o servidor devolve a página pronta. Nada de fatiar em memória —
 * um projeto com milhares de arquivos nunca chega inteiro ao navegador.
 */
export function TabelaDocumentos({
  projetoId,
  linhas,
  filtradaPorDisciplina,
  temFiltroAtivo,
  podeCoordenacao,
  podeValidar,
  podeExcluir,
  podeSolicitarExclusao,
  colunas,
}: {
  projetoId: string;
  linhas: LinhaDocumento[];
  filtradaPorDisciplina: boolean;
  temFiltroAtivo: boolean;
  podeCoordenacao: boolean;
  podeValidar: boolean;
  podeExcluir: boolean;
  podeSolicitarExclusao: boolean;
  /** Ids das colunas que o usuário escolheu ver (resolvido no servidor). */
  colunas: Set<string>;
}) {
  // A página já vem ordenada e recortada do banco (F1-PR10) — o `SortableHead` só empurra
  // `?sort=&dir=` para a URL, e a query do servidor faz o trabalho.
  const ordenadas = linhas;

  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  // Só conta o que ainda está na tela: trocar de disciplina (ou filtrar, em F1-PR7) troca as
  // linhas, e uma seleção fantasma de linha invisível viraria ação em lote surpresa.
  const selecionados = useMemo(
    () => ordenadas.filter((l) => selecao.has(l.id)).map((l) => l.id),
    [ordenadas, selecao],
  );
  const validaveis = useMemo(
    () => ordenadas.filter((l) => selecao.has(l.id) && l.validado === false).length,
    [ordenadas, selecao],
  );
  const todasMarcadas = ordenadas.length > 0 && selecionados.length === ordenadas.length;

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
            {colunas.has("revisao") && <SortableHead field="versao" className="text-right">Revisão</SortableHead>}
            {colunas.has("validado") && <TableHead>Validado</TableHead>}
            {colunas.has("extensao") && <TableHead>Extensão</TableHead>}
            {colunas.has("responsavel") && <TableHead>Responsável</TableHead>}
            {colunas.has("data") && <SortableHead field="data">Atualizado</SortableHead>}
            {colunas.has("tamanho") && <SortableHead field="tamanho" className="text-right">Tamanho</SortableHead>}
            <TableHead className="w-10"><span className="sr-only">Ações</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenadas.map((l) => (
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
              <TableCell className="max-w-[22rem] font-medium whitespace-normal">{l.nome}</TableCell>
              {colunas.has("revisao") && (
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {rotuloRevisao(l.versao)}
                </TableCell>
              )}
              {colunas.has("validado") && (
                <TableCell>
                  {l.validado === null ? (
                    <span className="text-xs text-muted-foreground" title="Arquivos em pasta não passam por validação">
                      —
                    </span>
                  ) : l.validado ? (
                    <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                      Validado
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
                  <BadgeExtensao
                    projetoId={projetoId}
                    uploadId={l.id}
                    nome={l.nome}
                    ext={l.ext}
                    downloadUrl={l.downloadUrl}
                    podeCoordenacao={podeCoordenacao}
                  />
                </TableCell>
              )}
              {colunas.has("responsavel") && <TableCell className="text-muted-foreground">{l.autor}</TableCell>}
              {colunas.has("data") && (
                <TableCell className="tabular-nums text-muted-foreground">{formatarData(l.data)}</TableCell>
              )}
              {colunas.has("tamanho") && (
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmtBytes(l.tamanho)}
                </TableCell>
              )}
              <TableCell className="text-right">
                <MenuDocumento
                  projetoId={projetoId}
                  linha={l}
                  podeValidar={podeValidar}
                  podeExcluir={podeExcluir}
                  podeSolicitarExclusao={podeSolicitarExclusao}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      <BarraSelecaoDocumentos
        projetoId={projetoId}
        selecionados={selecionados}
        totalValidaveis={validaveis}
        podeValidar={podeValidar}
        podeExcluir={podeExcluir}
        onLimpar={() => setSelecao(new Set())}
      />
    </div>
  );
}
