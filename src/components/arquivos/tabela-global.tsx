"use client";

import { useState } from "react";
import Link from "next/link";
import { FileArchive, FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BadgeExtensao } from "@/components/projetos/arquivos/badge-extensao";
import { DisciplinaIcone } from "@/components/projetos/disciplina-icone";
import { formatarData, formatarDataHora, rotuloRevisao } from "@/lib/utils";
import { MAX_ARQUIVOS_ZIP } from "@/modules/arquivos/arvore-global";
import type { LinhaDoc } from "@/modules/uploads/documentos-agrupados";

/**
 * Tabela do diretório geral — documentos de VÁRIOS projetos na mesma lista.
 *
 * Deliberadamente NÃO é a `TabelaDocumentos` da aba do projeto. Aquela é amarrada a um projeto
 * (catálogos de fase/tipo/status, listas de documentos, link público, barra de seleção, edição de
 * metadados) e generalizá-la significaria carregar catálogo de N projetos para desenhar uma
 * linha. Aqui o escopo é achar o arquivo, abrir e baixar — inclusive em lote, pela seleção.
 *
 * O diretório geral é uma tela de CONSULTA: mostra o estado da validação, não deixa mudá-lo.
 * Validar (e desfazer) continua na aba do projeto, junto do contexto que a decisão exige —
 * apontamentos, revisão, entrega. O código do projeto em cada linha leva para lá.
 */
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export type ProjetoDaLinha = { id: string; codigo: string; nome: string };

export function TabelaGlobalArquivos({
  linhas,
  projetos,
  podeCoordenacao,
  temFiltro,
}: {
  linhas: LinhaDoc[];
  /** Código e nome por id — a linha só carrega `projetoId`. */
  projetos: Map<string, ProjetoDaLinha>;
  podeCoordenacao: boolean;
  temFiltro: boolean;
}) {
  // Seleção por DOCUMENTO, download por ARQUIVO: marcar uma linha leva o PDF e o DWG dela.
  // Só o que está na tela — trocar de pasta ou de página limpa, senão a pessoa baixaria coisa
  // que não vê mais.
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const naTela = new Set(linhas.map((l) => l.id));
  const marcados = [...selecao].filter((id) => naTela.has(id));
  const uploadIds = linhas.filter((l) => marcados.includes(l.id)).flatMap((l) => l.arquivos.map((a) => a.id));

  function alternar(id: string) {
    setSelecao((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  if (linhas.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Nenhum documento encontrado"
        description={
          temFiltro
            ? "Ajuste a busca ou escolha outra pasta no painel."
            : "Os arquivos dos projetos aparecem aqui conforme forem enviados."
        }
      />
    );
  }

  const todosMarcados = marcados.length === linhas.length && linhas.length > 0;

  return (
    <div className="space-y-3">
      {marcados.length > 0 && (
        <BarraSelecao
          documentos={marcados.length}
          uploadIds={uploadIds}
          onLimpar={() => setSelecao(new Set())}
        />
      )}

      {/* Celular: um cartão por documento — a tabela sairia em rolagem lateral. Mesmo padrão
          já adotado na aba do projeto. */}
      <ul className="overflow-hidden rounded-md border border-border bg-card md:hidden" aria-label="Documentos">
        {linhas.map((linha) => (
          <CartaoGlobal
            key={linha.id}
            linha={linha}
            projeto={projetos.get(linha.projetoId)}
            podeCoordenacao={podeCoordenacao}
            marcada={marcados.includes(linha.id)}
            onMarcar={() => alternar(linha.id)}
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
                  onCheckedChange={() => setSelecao(todosMarcados ? new Set() : new Set(linhas.map((l) => l.id)))}
                  aria-label={todosMarcados ? "Desmarcar todos" : "Marcar todos os documentos da página"}
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => {
              const projeto = projetos.get(linha.projetoId);
              return (
                <TableRow key={linha.id} data-marcada={marcados.includes(linha.id)} className="data-[marcada=true]:bg-accent/40">
                  <TableCell>
                    <Checkbox
                      checked={marcados.includes(linha.id)}
                      onCheckedChange={() => alternar(linha.id)}
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
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
}: {
  linha: LinhaDoc;
  projeto: ProjetoDaLinha | undefined;
  podeCoordenacao: boolean;
  marcada: boolean;
  onMarcar: () => void;
}) {
  const identificacao = [linha.faseSigla, linha.tipoSigla, linha.revisaoAtual !== null ? rotuloRevisao(linha.revisaoAtual) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className="space-y-2 border-b border-border p-3 last:border-b-0 data-[marcada=true]:bg-accent/40"
      data-marcada={marcada}
    >
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
    </li>
  );
}

/**
 * Barra da seleção: quantos documentos, quantos arquivos e o .zip.
 *
 * Reusa `/api/uploads/zip?ids=`, que já existe para a aba do projeto — ela confere o escopo de
 * CADA upload por conta própria, então uma seleção que atravessa projetos continua segura.
 * Acima do teto o botão nasce desabilitado, com o número: melhor saber antes de clicar.
 */
function BarraSelecao({
  documentos,
  uploadIds,
  onLimpar,
}: {
  documentos: number;
  uploadIds: string[];
  onLimpar: () => void;
}) {
  const excede = uploadIds.length > MAX_ARQUIVOS_ZIP;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-accent/40 px-3 py-2">
      <span className="text-sm">
        <strong className="tabular-nums">{documentos}</strong> {documentos === 1 ? "documento" : "documentos"}
        <span className="text-muted-foreground"> · {uploadIds.length} {uploadIds.length === 1 ? "arquivo" : "arquivos"}</span>
      </span>
      <div className="ml-auto flex items-center gap-2">
        {excede ? (
          <span
            className="text-xs text-muted-foreground"
            title={`Acima do limite de ${MAX_ARQUIVOS_ZIP} arquivos por download.`}
          >
            Seleção grande demais — limite de {MAX_ARQUIVOS_ZIP} arquivos
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            render={<a href={`/api/uploads/zip?ids=${uploadIds.join(",")}`} />}
          >
            <FileArchive className="size-3.5" aria-hidden /> Baixar selecionados
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onLimpar}>
          Limpar
        </Button>
      </div>
    </div>
  );
}
