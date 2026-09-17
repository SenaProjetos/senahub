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
import { formatarData, formatarDataHora, rotuloRevisao } from "@/lib/utils";

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
    // `LinhaDoc.id` JÁ é o id do DocumentoDisciplina que agrupa a linha (a tabela da V2 é
    // agrupada por documento), então ele é a chave direta — não há apelido a resolver aqui.
    documentoId: linha.id,
    documentoCanonicoId: null,
    autor: linha.autor,
    data: linha.atualizadoEm,
    tamanho: linha.tamanhoTotal,
    downloadUrl: arquivo.downloadUrl,
    podeGerir: linha.podeGerir,
  };
}

/** Selo de validação — mesma leitura na tabela e no cartão. */
function BadgeValidacao({ estado }: { estado: ReturnType<typeof estadoValidacao> }) {
  if (estado === null) {
    return (
      <span className="text-xs text-muted-foreground" title="Arquivos em pasta não passam por validação">
        —
      </span>
    );
  }
  if (estado === "validado") {
    return (
      <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
        Validado
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {estado === "parcial" ? "Parcial" : "Pendente"}
    </Badge>
  );
}

/**
 * O mesmo documento em cartão, para celular: a tabela tem 10+ colunas e no telefone virava
 * rolagem lateral (ou texto espremido). Aqui cada documento é um bloco, com o que resolve na
 * mão — título, identificação, arquivos para abrir/baixar e o menu de ações. As colunas
 * escondidas pelo seletor de colunas continuam valendo: quem tira "Tamanho" não o vê aqui também.
 */
function CartaoDocumento({
  linha,
  projetoId,
  colunas,
  marcada,
  onMarcar,
  podeCoordenacao,
  podeValidar,
  podeExcluir,
  podeSolicitarExclusao,
  exclusoesPendentes,
  fases,
  status,
}: {
  linha: LinhaDoc;
  projetoId: string;
  colunas: Set<string>;
  marcada: boolean;
  onMarcar: () => void;
  podeCoordenacao: boolean;
  podeValidar: boolean;
  podeExcluir: boolean;
  podeSolicitarExclusao: boolean;
  exclusoesPendentes: Set<string>;
  fases: OpcaoFaseDocumento[];
  status: OpcaoStatusDocumento[];
}) {
  const validacao = estadoValidacao(linha.arquivos);
  const menu = linhaParaMenu(linha);
  const identificacao = [
    colunas.has("numero") && linha.numeroPrancha !== null ? String(linha.numeroPrancha).padStart(4, "0") : null,
    colunas.has("fase") ? linha.faseSigla : null,
    colunas.has("tipo") ? linha.tipoSigla : null,
    colunas.has("papel") ? linha.papelSigla : null,
    colunas.has("revisao") && linha.revisaoAtual !== null ? rotuloRevisao(linha.revisaoAtual) : null,
  ].filter(Boolean);

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
        <DisciplinaIcone
          nome={linha.disciplinaNome}
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <PainelDocumentoDetalhe linha={linha} fases={fases} status={status} />
          {(linha.titulo ?? linha.tituloPrancha) && (
            <p className="truncate text-xs text-muted-foreground" title={linha.nome}>
              {linha.nome}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">{linha.disciplinaNome}</p>
        </div>
        {menu && (
          <MenuDocumento
            projetoId={projetoId}
            linha={menu}
            podeValidar={podeValidar}
            podeExcluir={podeExcluir}
            podeSolicitarExclusao={podeSolicitarExclusao}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-8">
        {identificacao.length > 0 && (
          <span className="font-mono text-[11px] text-muted-foreground">{identificacao.join(" · ")}</span>
        )}
        {colunas.has("validado") && <BadgeValidacao estado={validacao} />}
        {linha.statusNome && (
          <Badge variant="outline" title={linha.statusFinal ? "Status final" : undefined}>
            {linha.statusNome}
          </Badge>
        )}
        {linha.ehBackup && (
          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning" title="Backup do modelo">
            Backup
          </Badge>
        )}
        {linha.arquivos.some((a) => exclusoesPendentes.has(a.id)) && (
          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
            exclusão solicitada
          </Badge>
        )}
      </div>

      {colunas.has("extensao") && (
        <div className="flex flex-wrap items-center gap-1 pl-8">
          {linha.arquivos.map((arquivo) => (
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
      )}

      <p className="pl-8 text-[11px] text-muted-foreground">
        {colunas.has("data") && (
          <span title={`Enviado em ${formatarDataHora(linha.atualizadoEm)} por ${linha.autor}`}>
            {formatarData(linha.atualizadoEm)}
          </span>
        )}
        {colunas.has("tamanho") && <span> · {fmtBytes(linha.tamanhoTotal)}</span>}
        {colunas.has("responsavel") && <span> · {linha.autor}</span>}
      </p>
    </li>
  );
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
      {/* Celular: um cartão por documento. A tabela continua sendo a tela de trabalho no
          computador — aqui ela sairia em rolagem lateral, com tudo espremido. */}
      <ul className="overflow-hidden rounded-md border border-border bg-card md:hidden" aria-label="Documentos">
        {ordenadas.map((l) => (
          <CartaoDocumento
            key={l.id}
            linha={l}
            projetoId={projetoId}
            colunas={colunas}
            marcada={selecao.has(l.id)}
            onMarcar={() => alternar(l.id)}
            podeCoordenacao={podeCoordenacao}
            podeValidar={podeValidar}
            podeExcluir={podeExcluir}
            podeSolicitarExclusao={podeSolicitarExclusao}
            exclusoesPendentes={exclusoesPendentes}
            fases={fases}
            status={status}
          />
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-md border border-border bg-card md:block">
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
            {/* Disciplina só com ícone: o nome por extenso comia a largura que o Nº e o título
                precisam, e o painel à esquerda já diz qual disciplina está aberta. */}
            <SortableHead field="disciplina" className="w-12">
              <span className="sr-only">Disciplina</span>
              <span aria-hidden>Disc.</span>
            </SortableHead>
            {colunas.has("numero") && <TableHead>Nº</TableHead>}
            {colunas.has("fase") && <TableHead>Fase</TableHead>}
            {colunas.has("tipo") && <TableHead>Tipo</TableHead>}
            <SortableHead field="nome">Documento</SortableHead>
            {colunas.has("revisao") && <SortableHead field="revisao" className="text-right">Revisão</SortableHead>}
            {colunas.has("validado") && <TableHead>Validado</TableHead>}
            {colunas.has("extensao") && <TableHead>Extensão</TableHead>}
            {colunas.has("papel") && <TableHead>Papel</TableHead>}
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
                <span className="flex items-center" title={l.disciplinaNome}>
                  <DisciplinaIcone nome={l.disciplinaNome} className="size-4 shrink-0 text-muted-foreground" />
                  <span className="sr-only">{l.disciplinaNome}</span>
                </span>
              </TableCell>
              {colunas.has("numero") && (
                <TableCell className="font-mono text-xs tabular-nums">
                  {l.numeroPrancha !== null ? String(l.numeroPrancha).padStart(4, "0") : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
              {colunas.has("fase") && (
                <TableCell className="text-xs" title={l.faseNome ?? undefined}>
                  {l.faseSigla ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
              )}
              {colunas.has("tipo") && (
                <TableCell className="text-xs" title={l.tipoNome ?? undefined}>
                  {l.tipoSigla ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
              )}
              <TableCell className="max-w-[32rem]">
                <div className="flex min-w-0 items-center gap-2">
                  <PainelDocumentoDetalhe linha={l} fases={fases} status={status} />
                  {/* Com título, o nome do arquivo vira referência secundária; sem título, o
                      próprio nome já é o texto do gatilho e repeti-lo seria ruído. */}
                  {(l.titulo ?? l.tituloPrancha) && (
                    <span className="min-w-0 truncate text-xs text-muted-foreground" title={l.nome}>
                      {l.nome}
                    </span>
                  )}
                  {/* Alguém pediu a exclusão de um arquivo deste documento e um admin ainda
                      não decidiu — o arquivo continua valendo, mas quem olha a lista
                      precisa saber que há um pedido em aberto. */}
                  {l.arquivos.some((a) => exclusoesPendentes.has(a.id)) && (
                    <Badge variant="outline" className="shrink-0 border-warning/40 bg-warning/10 text-warning">
                      exclusão solicitada
                    </Badge>
                  )}
                  {l.statusNome && (
                    <Badge variant="outline" className="shrink-0" title={l.statusFinal ? "Status final" : undefined}>
                      {l.statusNome}
                    </Badge>
                  )}
                  {/* Pendência original da V2 (item 1 da spec de nomenclatura): backup do modelo
                      (pacote B) e extensão de backup (.qibzip, .tqs…) apareciam sem rótulo. */}
                  {l.ehBackup && (
                    <Badge variant="outline" className="shrink-0 border-warning/40 bg-warning/10 text-warning" title="Backup do modelo">
                      Backup
                    </Badge>
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
                  <BadgeValidacao estado={validacao} />
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
              {colunas.has("papel") && (
                <TableCell className="text-xs" title={l.papelNome ?? undefined}>
                  {l.papelSigla ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
              )}
              {colunas.has("responsavel") && <TableCell className="text-muted-foreground">{l.autor}</TableCell>}
              {colunas.has("data") && (
                // Data visível, hora no title: a coluna precisa caber, mas "que hora entrou"
                // é o que resolve dúvida de reenvio no mesmo dia.
                <TableCell
                  className="tabular-nums text-muted-foreground"
                  title={`Enviado em ${formatarDataHora(l.atualizadoEm)} por ${l.autor}`}
                >
                  {formatarData(l.atualizadoEm)}
                </TableCell>
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
