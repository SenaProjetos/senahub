"use client";

import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BadgeExtensao } from "@/components/projetos/arquivos/badge-extensao";
import { AcoesValidacaoArquivo } from "@/components/projetos/acoes-validacao-arquivo";
import { DisciplinaIcone } from "@/components/projetos/disciplina-icone";
import { formatarData, formatarDataHora, rotuloRevisao } from "@/lib/utils";
import type { LinhaDoc } from "@/modules/uploads/documentos-agrupados";

/**
 * Tabela do diretório geral — documentos de VÁRIOS projetos na mesma lista.
 *
 * Deliberadamente NÃO é a `TabelaDocumentos` da aba do projeto. Aquela é amarrada a um projeto
 * (catálogos de fase/tipo/status, listas de documentos, link público, barra de seleção, edição de
 * metadados) e generalizá-la significaria carregar catálogo de N projetos para desenhar uma
 * linha. Aqui o escopo é o que a tela antiga (`DiretorioView`) já entregava: achar o arquivo,
 * abrir, baixar e validar. Editar metadado continua na aba do projeto — o código do projeto em
 * cada linha leva para lá.
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
  podeValidar,
  podeCoordenacao,
  temFiltro,
}: {
  linhas: LinhaDoc[];
  /** Código e nome por id — a linha só carrega `projetoId`. */
  projetos: Map<string, ProjetoDaLinha>;
  podeValidar: boolean;
  podeCoordenacao: boolean;
  temFiltro: boolean;
}) {
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

  return (
    <div className="space-y-3">
      {/* Celular: um cartão por documento — a tabela sairia em rolagem lateral. Mesmo padrão
          já adotado na aba do projeto. */}
      <ul className="overflow-hidden rounded-md border border-border bg-card md:hidden" aria-label="Documentos">
        {linhas.map((linha) => (
          <CartaoGlobal
            key={linha.id}
            linha={linha}
            projeto={projetos.get(linha.projetoId)}
            podeValidar={podeValidar}
            podeCoordenacao={podeCoordenacao}
          />
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-md border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
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
                <TableRow key={linha.id}>
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
                    <Validacao linha={linha} podeValidar={podeValidar} />
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
 * Validação por ARQUIVO, não por documento: é o upload que se valida, e um documento pode ter o
 * PDF validado e o DWG não. Arquivo em PastaProjeto (`validado: null`) não passa por validação.
 */
function Validacao({ linha, podeValidar }: { linha: LinhaDoc; podeValidar: boolean }) {
  const validaveis = linha.arquivos.filter((a) => a.validado !== null);
  if (validaveis.length === 0) {
    return (
      <span className="text-xs text-muted-foreground" title="Arquivos em pasta não passam por validação">
        —
      </span>
    );
  }
  const validados = validaveis.filter((a) => a.validado).length;
  const todos = validados === validaveis.length;

  return (
    <div className="flex flex-col items-start gap-1">
      <Badge
        variant="outline"
        className={todos ? "border-success/40 bg-success/10 text-success" : "text-muted-foreground"}
      >
        {todos ? "Validado" : validados > 0 ? `Parcial (${validados}/${validaveis.length})` : "Pendente"}
      </Badge>
      {podeValidar &&
        validaveis.map((arquivo) => (
          <AcoesValidacaoArquivo
            key={arquivo.id}
            uploadId={arquivo.id}
            nomeArquivo={arquivo.nome}
            validado={!!arquivo.validado}
          />
        ))}
    </div>
  );
}

function CartaoGlobal({
  linha,
  projeto,
  podeValidar,
  podeCoordenacao,
}: {
  linha: LinhaDoc;
  projeto: ProjetoDaLinha | undefined;
  podeValidar: boolean;
  podeCoordenacao: boolean;
}) {
  const identificacao = [linha.faseSigla, linha.tipoSigla, linha.revisaoAtual !== null ? rotuloRevisao(linha.revisaoAtual) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="space-y-2 border-b border-border p-3 last:border-b-0">
      <div className="flex items-start gap-2">
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
        <Validacao linha={linha} podeValidar={podeValidar} />
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
