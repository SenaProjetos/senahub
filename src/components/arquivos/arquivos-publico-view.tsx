"use client";

import { useState } from "react";
import {
  ChevronRight,
  Download,
  Eye,
  FileArchive,
  FileText,
  File as FileIcon,
  Folder,
  FolderOpen,
} from "lucide-react";
import type { ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";
import { FASE_TODAS } from "@/modules/uploads/arvore-navegacao";
import { cn, rotuloRevisao } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoPublico } from "@/components/publico/cabecalho-publico";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type ArquivoPublicoView = ConteudoPublico["disciplinas"][number]["pastas"][number]["extensoes"][number]["arquivos"][number];

/** Botão de .zip de uma pasta (disciplina, fase ou formato) — o recorte vai na URL. */
function BaixarPasta({ token, rotulo, params }: { token: string; rotulo: string; params: Record<string, string> }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-7"
      title={`Baixar ${rotulo} (.zip)`}
      aria-label={`Baixar ${rotulo} como .zip`}
      render={<a href={`/api/p/arquivos/${token}/zip?${new URLSearchParams(params)}`} rel="noopener" />}
    >
      <FileArchive className="size-3.5" />
    </Button>
  );
}

function LinhaArquivo({ token, arquivo }: { token: string; arquivo: ArquivoPublicoView }) {
  return (
    <li className="flex items-center gap-2 rounded-sm py-1.5 pl-14 pr-1 text-sm hover:bg-muted/40">
      {arquivo.ehPdf ? (
        <FileText className="size-4 shrink-0 text-destructive" />
      ) : (
        <FileIcon className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate" title={arquivo.nome}>
        {arquivo.nome}
      </span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground" title={`Revisão ${arquivo.versao}`}>
        {rotuloRevisao(arquivo.versao)}
      </span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmtBytes(arquivo.tamanho)}</span>
      {arquivo.ehPdf && (
        <a
          href={`/api/p/arquivos/${token}/${arquivo.id}?disposition=inline`}
          target="_blank"
          rel="noopener"
          className="shrink-0 text-primary hover:text-primary/80"
          title="Visualizar (PDF)"
          aria-label={`Visualizar ${arquivo.nome}`}
        >
          <Eye className="size-4" />
        </a>
      )}
      <a
        href={`/api/p/arquivos/${token}/${arquivo.id}`}
        className="shrink-0 text-primary hover:text-primary/80"
        title="Baixar"
        aria-label={`Baixar ${arquivo.nome}`}
      >
        <Download className="size-4" />
      </a>
    </li>
  );
}

/** Pastas de formato (PDF, DWG…) com os arquivos dentro — usadas com ou sem o nível de fase. */
function PastasDeFormato({
  token,
  disciplina,
  fase,
  prefixoRotulo,
  recuo = "pl-10",
}: {
  token: string;
  disciplina: ConteudoPublico["disciplinas"][number];
  fase: ConteudoPublico["disciplinas"][number]["pastas"][number];
  prefixoRotulo: string;
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
              token={token}
              rotulo={`${prefixoRotulo} / ${pasta.rotulo}`}
              params={
                fase.chave === FASE_TODAS
                  ? { disciplinaId: disciplina.id, ext: pasta.chave }
                  : { disciplinaId: disciplina.id, fase: fase.chave, ext: pasta.chave }
              }
            />
          </div>
          <ul>
            {pasta.arquivos.map((arquivo) => (
              <LinhaArquivo key={arquivo.id} token={token} arquivo={arquivo} />
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
  token,
  disciplina,
}: {
  token: string;
  disciplina: ConteudoPublico["disciplinas"][number];
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
          <span className="truncate text-sm font-semibold">{disciplina.nome}</span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {disciplina.total} arquivo{disciplina.total === 1 ? "" : "s"}
          </span>
        </button>
        <BaixarPasta token={token} rotulo={`"${disciplina.nome}"`} params={{ disciplinaId: disciplina.id }} />
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
                  <PastasDeFormato token={token} disciplina={disciplina} fase={fase} prefixoRotulo={disciplina.nome} recuo="pl-6" />
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
                    token={token}
                    rotulo={`${disciplina.nome} / ${fase.rotulo}`}
                    params={{ disciplinaId: disciplina.id, fase: fase.chave }}
                  />
                </div>

                {faseAberta && (
                  <PastasDeFormato
                    token={token}
                    disciplina={disciplina}
                    fase={fase}
                    prefixoRotulo={`${disciplina.nome} / ${fase.rotulo}`}
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

/** ARTs do projeto: documento vigente + versões anteriores, todos com PDF. Somente download. */
function ArtsPublicas({ token, arts }: { token: string; arts: ConteudoPublico["arts"] }) {
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
                  href={`/api/p/arquivos/${token}/art/${a.id}?disposition=inline`}
                  target="_blank"
                  rel="noopener"
                  className="shrink-0 text-primary hover:text-primary/80"
                  aria-label={`Visualizar ${a.rotulo}`}
                >
                  <Eye className="size-4" />
                </a>
                <a
                  href={`/api/p/arquivos/${token}/art/${a.id}`}
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
                    href={`/api/p/arquivos/${token}/art/${v.id}`}
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

export function ArquivosPublicoView({ token, conteudo }: { token: string; conteudo: ConteudoPublico }) {
  const total = conteudo.disciplinas.reduce((n, d) => n + d.total, 0);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <CabecalhoPublico
        icone={FolderOpen}
        rotulo="Arquivos do projeto"
        codigo={conteudo.projeto.codigo}
        titulo={conteudo.projeto.nome}
        descricao={`${total} arquivo${total === 1 ? "" : "s"} dispon${total === 1 ? "ível" : "íveis"} para visualização e download.`}
        acoes={
          <Button render={<a href={`/api/p/arquivos/${token}/zip`} rel="noopener" />}>
            <Download className="size-4" /> Baixar tudo (.zip)
          </Button>
        }
      />

      <Card>
        <CardContent className="divide-y p-2">
          {conteudo.disciplinas.map((d) => (
            <Disciplina key={d.id} token={token} disciplina={d} />
          ))}
          {conteudo.arts.length > 0 && <ArtsPublicas token={token} arts={conteudo.arts} />}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">Acesso somente leitura.</p>
    </main>
  );
}
