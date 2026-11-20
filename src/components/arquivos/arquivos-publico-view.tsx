"use client";

import { createContext, useContext, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronRight,
  Download,
  Eye,
  FileArchive,
  FileText,
  File as FileIcon,
  Folder,
  FolderOpen,
  HardHat,
  Send,
} from "lucide-react";
import type { ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";
import { FASE_TODAS } from "@/modules/uploads/arvore-navegacao";
import { cn, formatarBytes, rotuloRevisao } from "@/lib/utils";
import { classeDoStatus } from "@/modules/uploads/status-documento";
import { COR_CONTROLE } from "@/modules/uploads/ciclo/estados";
import { conteudoTemZip, temArquivoBaixavel } from "@/modules/projetos/arquivos/link-publico-regras";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoPublico } from "@/components/publico/cabecalho-publico";

export type ArquivoPublicoView = ConteudoPublico["disciplinas"][number]["pastas"][number]["extensoes"][number]["arquivos"][number];

/**
 * O que SÓ o portal do cliente acrescenta à linha de um arquivo (botão "Pedir revisão", selo do pedido aguardando,
 * olho abrindo o visualizador do portal). Por contexto, para não atravessar as quatro camadas da árvore; o link
 * público não passa nada e fica como sempre foi.
 */
export type AcoesDoArquivo = {
  /** Selos extras ao lado do nome. */
  selos?: (arquivo: ArquivoPublicoView) => ReactNode;
  /** Botões extras ao fim da linha. */
  extras?: (arquivo: ArquivoPublicoView) => ReactNode;
  /** Para onde o olho do PDF leva (padrão: o PDF inline pela rota de download). */
  hrefVer?: (arquivo: ArquivoPublicoView) => string;
};
const AcoesDoArquivoContext = createContext<AcoesDoArquivo>({});

export function ProvedorAcoesDoArquivo({ valor, children }: { valor: AcoesDoArquivo; children: ReactNode }) {
  return <AcoesDoArquivoContext.Provider value={valor}>{children}</AcoesDoArquivoContext.Provider>;
}

type FasePublica = ConteudoPublico["disciplinas"][number]["pastas"][number];
const arquivosDaFase = (f: FasePublica) => f.extensoes.flatMap((e) => e.arquivos);
const arquivosDaDisciplina = (d: ConteudoPublico["disciplinas"][number]) => d.pastas.flatMap(arquivosDaFase);

/**
 * Botão de .zip de uma pasta (disciplina, fase ou formato) — o recorte vai na URL. Some quando a pasta só
 * tem revisão bloqueada ou arquivo ausente no disco: o pacote viria vazio e o clique cairia numa página de erro.
 */
function BaixarPasta({
  base,
  rotulo,
  params,
  arquivos,
}: {
  base: string;
  rotulo: string;
  params: Record<string, string>;
  arquivos: readonly { bloqueado: boolean; indisponivel: boolean }[];
}) {
  if (!temArquivoBaixavel(arquivos)) return null;
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-7"
      title={`Baixar ${rotulo} (.zip)`}
      aria-label={`Baixar ${rotulo} como .zip`}
      render={<a href={`${base}/zip?${new URLSearchParams(params)}`} rel="noopener" />}
    >
      <FileArchive className="size-3.5" />
    </Button>
  );
}

/**
 * Descrição da revisão em até duas linhas, com "Ver tudo" só quando o texto é cortado (medido na tela, então
 * vale para celular e computador). No toque não há `title`: o botão é a forma de ler o resto.
 */
function DescricaoRevisao({ texto, arquivo }: { texto: string; arquivo: string }) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [aberta, setAberta] = useState(false);
  const [cortada, setCortada] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || aberta) return;
    const medir = () => setCortada(el.scrollHeight > el.clientHeight + 1);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [aberta, texto]);
  return (
    <span className="basis-full pl-6 text-xs text-muted-foreground">
      <span id={id} ref={ref} className={cn("block break-words", !aberta && "line-clamp-2")}>
        {texto}
      </span>
      {(cortada || aberta) && (
        // Texto no `foreground` sublinhado: o `text-primary` do tema escuro ficava perto de 3:1. Alvo de toque
        // de 24 px (44 px em tela de toque) e anel de foco próprio; o nome acessível leva o arquivo.
        <button
          type="button"
          className="inline-flex min-h-6 items-center rounded-sm font-medium text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11"
          aria-expanded={aberta}
          aria-controls={id}
          aria-label={`${aberta ? "Ver menos" : "Ver tudo"}: descrição da revisão de ${arquivo}`}
          onClick={() => setAberta((v) => !v)}
        >
          {aberta ? "Ver menos" : "Ver tudo"}
        </button>
      )}
    </span>
  );
}

function LinhaArquivo({ base, arquivo }: { base: string; arquivo: ArquivoPublicoView }) {
  const acoes = useContext(AcoesDoArquivoContext);
  // Bloqueada ou fora do disco: listada com o selo, sem ver nem baixar (a rota daria 404 ou 410).
  const baixavel = !arquivo.bloqueado && !arquivo.indisponivel;
  const semArquivo = arquivo.indisponivel && !arquivo.bloqueado;
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-sm py-1.5 pl-14 pr-1 text-sm hover:bg-muted/40">
      {arquivo.ehPdf ? (
        <FileText className="size-4 shrink-0 text-destructive" />
      ) : (
        <FileIcon className="size-4 shrink-0 text-muted-foreground" />
      )}
      {/* No celular a marca desce para a linha de baixo: lado a lado ela comeria o nome do arquivo. "Em revisão"
          aparece uma vez só, no selo; o motivo vai em texto visível embaixo, inteiro (no toque não há `title`). */}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="flex max-w-full min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
          <span className="max-w-full truncate" title={arquivo.nome}>
            {arquivo.nome}
          </span>
          {arquivo.emRevisao !== null && (
            <span
              className={cn("shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium leading-none", classeDoStatus(COR_CONTROLE.em_revisao))}
            >
              Em revisão
            </span>
          )}
          {acoes.selos?.(arquivo)}
          {arquivo.bloqueado && (
            <span
              className={cn("shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium leading-none", classeDoStatus(COR_CONTROLE.bloqueio))}
            >
              Download bloqueado
            </span>
          )}
          {semArquivo && (
            <span
              className={cn("shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium leading-none", classeDoStatus("neutro"))}
            >
              Indisponível
            </span>
          )}
        </span>
        {arquivo.emRevisao && (
          <span className="max-w-full text-xs break-words text-muted-foreground">Motivo: {arquivo.emRevisao}</span>
        )}
        {/* A explicação de cada selo vai em texto visível (no toque e no teclado não há `title`). */}
        {arquivo.bloqueado && (
          <span className="max-w-full text-xs break-words text-muted-foreground">
            Esta revisão está bloqueada para download. Fale com a equipe do projeto.
          </span>
        )}
        {semArquivo && (
          <span className="max-w-full text-xs break-words text-muted-foreground">
            O arquivo não está disponível no momento. Fale com a equipe do projeto.
          </span>
        )}
      </span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground" title={`Revisão ${arquivo.versao}`}>
        {rotuloRevisao(arquivo.versao)}
      </span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{formatarBytes(arquivo.tamanho)}</span>
      {arquivo.ehPdf && baixavel && (
        <a
          href={acoes.hrefVer ? acoes.hrefVer(arquivo) : `${base}/${arquivo.id}?disposition=inline`}
          target={acoes.hrefVer ? undefined : "_blank"}
          rel="noopener"
          className="shrink-0 text-primary hover:text-primary/80"
          title="Visualizar (PDF)"
          aria-label={`Visualizar ${arquivo.nome}`}
        >
          <Eye className="size-4" />
        </a>
      )}
      {baixavel && (
        <a
          href={`${base}/${arquivo.id}`}
          className="shrink-0 text-primary hover:text-primary/80"
          title="Baixar"
          aria-label={`Baixar ${arquivo.nome}`}
        >
          <Download className="size-4" />
        </a>
      )}
      {acoes.extras?.(arquivo)}
      {/* O que mudou na revisão, numa linha própria com a largura toda: ao lado do nome, no celular,
          sobrariam poucos caracteres. Duas linhas visíveis e "Ver tudo" quando o texto passa delas. */}
      {arquivo.descricaoRevisao && <DescricaoRevisao texto={arquivo.descricaoRevisao} arquivo={arquivo.nome} />}
    </li>
  );
}

/** Pastas de formato (PDF, DWG…) com os arquivos dentro — usadas com ou sem o nível de fase. */
function PastasDeFormato({
  base,
  disciplina,
  fase,
  prefixoRotulo,
  recorteBase,
  recuo = "pl-10",
}: {
  base: string;
  disciplina: ConteudoPublico["disciplinas"][number];
  fase: ConteudoPublico["disciplinas"][number]["pastas"][number];
  prefixoRotulo: string;
  /** Recorte de cima que todo .zip daqui leva junto (a pasta do cliente, no link por situação). */
  recorteBase: Record<string, string>;
  recuo?: string;
}) {
  return (
    <ul>
      {fase.extensoes.map((pasta) => (
        <li key={pasta.chave}>
          <div className={cn("flex items-center gap-1.5 rounded-sm py-1.5 pr-1 hover:bg-muted/40", recuo)}>
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <Folder className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-xs uppercase">{pasta.rotulo}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{pasta.total}</span>
            </span>
            <BaixarPasta
              base={base}
              arquivos={pasta.arquivos}
              rotulo={`${prefixoRotulo} / ${pasta.rotulo}`}
              params={
                fase.chave === FASE_TODAS
                  ? { ...recorteBase, disciplinaId: disciplina.id, ext: pasta.chave }
                  : { ...recorteBase, disciplinaId: disciplina.id, fase: fase.chave, ext: pasta.chave }
              }
            />
          </div>
          <ul>
            {pasta.arquivos.map((arquivo) => (
              <LinhaArquivo key={arquivo.id} base={base} arquivo={arquivo} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/**
 * Disciplina do cliente: abre em pastas de fase e, dentro delas, de formato (PDF, DWG…) —
 * as MESMAS pastas da aba Arquivos, montadas no servidor. Cada nível tem seu .zip.
 */
function Disciplina({
  base,
  disciplina,
  recorteBase = {},
  recuo = "",
}: {
  base: string;
  disciplina: ConteudoPublico["disciplinas"][number];
  /** Recorte de cima que todo .zip daqui leva junto (a pasta do cliente, no link por situação). */
  recorteBase?: Record<string, string>;
  /** Recuo extra quando a disciplina mora dentro de uma pasta do cliente. */
  recuo?: string;
}) {
  const [aberto, setAberto] = useState(true);
  const [fasesAbertas, setFasesAbertas] = useState<Set<string>>(new Set());

  function alternarFase(chave: string) {
    setFasesAbertas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  return (
    <div className={recuo}>
      <div className="flex items-center gap-1.5 rounded-sm py-2 pr-1 hover:bg-muted/50">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={aberto}
        >
          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-90")} />
          <FolderOpen className="size-4 shrink-0 text-warning" />
          <span className="truncate text-sm font-semibold">{disciplina.nome}</span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {disciplina.total} arquivo{disciplina.total === 1 ? "" : "s"}
          </span>
        </button>
        <BaixarPasta base={base} arquivos={arquivosDaDisciplina(disciplina)} rotulo={`"${disciplina.nome}"`} params={{ ...recorteBase, disciplinaId: disciplina.id }} />
      </div>

      {aberto && (
        <ul>
          {disciplina.pastas.map((fase) => {
            const chave = `${disciplina.id}/${fase.chave}`;
            const faseAberta = fasesAbertas.has(chave);
            // Link criado sem "separar por fase": a pasta única não é desenhada — o cliente vê
            // disciplina → formato direto.
            if (fase.chave === FASE_TODAS) {
              return (
                <li key={fase.chave}>
                  <PastasDeFormato
                    base={base}
                    disciplina={disciplina}
                    fase={fase}
                    prefixoRotulo={disciplina.nome}
                    recorteBase={recorteBase}
                    recuo="pl-6"
                  />
                </li>
              );
            }
            return (
              <li key={fase.chave}>
                <div className="flex items-center gap-1.5 rounded-sm py-1.5 pl-6 pr-1 hover:bg-muted/40">
                  <button
                    type="button"
                    onClick={() => alternarFase(chave)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    aria-expanded={faseAberta}
                    title={fase.titulo}
                  >
                    <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", faseAberta && "rotate-90")} />
                    {faseAberta ? (
                      <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Folder className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-sm">{fase.rotulo}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{fase.total}</span>
                  </button>
                  <BaixarPasta
                    base={base}
                    arquivos={arquivosDaFase(fase)}
                    rotulo={`${disciplina.nome} / ${fase.rotulo}`}
                    params={{ ...recorteBase, disciplinaId: disciplina.id, fase: fase.chave }}
                  />
                </div>

                {faseAberta && (
                  <PastasDeFormato
                    base={base}
                    disciplina={disciplina}
                    fase={fase}
                    prefixoRotulo={`${disciplina.nome} / ${fase.rotulo}`}
                    recorteBase={recorteBase}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const EXPLICACAO_SITUACAO: Record<string, string> = {
  compartilhado: "Enviados para a sua análise.",
  liberado_obra: "Aprovados e liberados para execução na obra.",
};

/**
 * Pasta do cliente num link por situação (reunião de 29/09/2026): "Compartilhado" e "Liberado para obra",
 * cada uma com as disciplinas dentro. Sempre as duas — vazia diz que ainda não há nada, em vez de sumir.
 */
function PastaSituacao({ base, situacao }: { base: string; situacao: ConteudoPublico["situacoes"][number] }) {
  const [aberto, setAberto] = useState(true);
  const Icone = situacao.id === "liberado_obra" ? HardHat : Send;
  return (
    <div>
      <div className="flex items-center gap-1.5 rounded-sm py-2 pr-1 hover:bg-muted/50">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={aberto}
        >
          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-90")} />
          <Icone className="size-4 shrink-0 text-info" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{situacao.rotulo}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{EXPLICACAO_SITUACAO[situacao.id]}</span>
          </span>
          <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
            {situacao.total} arquivo{situacao.total === 1 ? "" : "s"}
          </span>
        </button>
        {situacao.total > 0 && <BaixarPasta base={base} arquivos={situacao.disciplinas.flatMap(arquivosDaDisciplina)} rotulo={`"${situacao.rotulo}"`} params={{ situacao: situacao.id }} />}
      </div>
      {aberto &&
        (situacao.disciplinas.length === 0 ? (
          <p className="py-2 pl-12 text-xs text-muted-foreground">Nada nesta pasta ainda.</p>
        ) : (
          situacao.disciplinas.map((d) => (
            <Disciplina key={d.id} base={base} disciplina={d} recorteBase={{ situacao: situacao.id }} recuo="pl-6" />
          ))
        ))}
    </div>
  );
}

/** ARTs do projeto: documento vigente + versões anteriores, todos com PDF. Somente download. */
function ArtsPublicas({ base, arts }: { base: string; arts: ConteudoPublico["arts"] }) {
  const [aberto, setAberto] = useState(true);
  return (
    <div>
      <div className="flex items-center gap-1.5 rounded-sm py-2 pr-1 hover:bg-muted/50">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={aberto}
        >
          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-90")} />
          <FolderOpen className="size-4 shrink-0 text-warning" />
          <span className="truncate text-sm font-semibold">ARTs</span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {arts.length} documento{arts.length === 1 ? "" : "s"}
          </span>
        </button>
      </div>
      {aberto && (
        <ul>
          {arts.map((a) => (
            <li key={a.id}>
              <div className="flex items-center gap-2 rounded-sm py-1.5 pl-8 pr-1 text-sm hover:bg-muted/40">
                <FileText className="size-4 shrink-0 text-destructive" />
                <span className="min-w-0 flex-1 truncate">
                  {a.rotulo}
                  {a.disciplina ? ` · ${a.disciplina}` : ""}
                </span>
                <a
                  href={`${base}/art/${a.id}?disposition=inline`}
                  target="_blank"
                  rel="noopener"
                  className="shrink-0 text-primary hover:text-primary/80"
                  aria-label={`Visualizar ${a.rotulo}`}
                >
                  <Eye className="size-4" />
                </a>
                <a
                  href={`${base}/art/${a.id}`}
                  className="shrink-0 text-primary hover:text-primary/80"
                  aria-label={`Baixar ${a.rotulo}`}
                >
                  <Download className="size-4" />
                </a>
              </div>
              {a.versoes.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-2 rounded-sm py-1 pl-14 pr-1 text-xs text-muted-foreground hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1 truncate">
                    versão anterior {v.numero} — {v.rotulo}
                  </span>
                  <a
                    href={`${base}/art/${v.id}`}
                    className="shrink-0 text-primary hover:text-primary/80"
                    aria-label={`Baixar versão ${v.numero} de ${a.rotulo}`}
                  >
                    <Download className="size-3.5" />
                  </a>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Árvore de entregas do cliente (pastas do cliente, disciplinas e ARTs), usada pelo link público e pelo
 * portal. `base` é o prefixo das rotas de download, sem barra final: `/api/p/arquivos/<token>` no link,
 * `/api/portal/projetos/<id>/arquivos` no portal — as duas expõem `/<uploadId>`, `/zip` e `/art/<id>`.
 */
export function ArvoreEntregas({ base, conteudo }: { base: string; conteudo: ConteudoPublico }) {
  return (
    <>
      {conteudo.situacoes.map((s) => (
        <PastaSituacao key={s.id} base={base} situacao={s} />
      ))}
      {conteudo.disciplinas.map((d) => (
        <Disciplina key={d.id} base={base} disciplina={d} />
      ))}
      {conteudo.arts.length > 0 && <ArtsPublicas base={base} arts={conteudo.arts} />}
    </>
  );
}

export function ArquivosPublicoView({ token, conteudo }: { token: string; conteudo: ConteudoPublico }) {
  const base = `/api/p/arquivos/${token}`;
  const total =
    conteudo.disciplinas.reduce((n, d) => n + d.total, 0) + conteudo.situacoes.reduce((n, s) => n + s.total, 0);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <CabecalhoPublico
        icone={FolderOpen}
        rotulo="Arquivos do projeto"
        codigo={conteudo.projeto.codigo}
        titulo={conteudo.projeto.nome}
        descricao={`${total} arquivo${total === 1 ? "" : "s"} dispon${total === 1 ? "ível" : "íveis"} para visualização e download.`}
        acoes={
          conteudoTemZip(conteudo) ? (
            <Button render={<a href={`${base}/zip`} rel="noopener" />}>
              <Download className="size-4" /> Baixar tudo (.zip)
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="divide-y p-2">
          <ArvoreEntregas base={base} conteudo={conteudo} />
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">Acesso somente leitura.</p>
    </main>
  );
}
