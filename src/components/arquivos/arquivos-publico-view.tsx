"use client";

import { useState } from "react";
import {
  ChevronRight,
  Download,
  Eye,
  FileArchive,
  FileText,
  File as FileIcon,
  FolderOpen,
} from "lucide-react";
import type { ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Disciplina({
  token,
  disciplina,
}: {
  token: string;
  disciplina: ConteudoPublico["disciplinas"][number];
}) {
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
          <span className="truncate text-sm font-semibold">{disciplina.nome}</span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {disciplina.arquivos.length} arquivo{disciplina.arquivos.length === 1 ? "" : "s"}
          </span>
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          title={`Baixar "${disciplina.nome}" (.zip)`}
          aria-label={`Baixar ${disciplina.nome} como .zip`}
          render={<a href={`/api/p/arquivos/${token}/zip?disciplinaId=${disciplina.id}`} rel="noopener" />}
        >
          <FileArchive className="size-3.5" />
        </Button>
      </div>
      {aberto && (
        <ul>
          {disciplina.arquivos.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-sm py-1.5 pl-8 pr-1 text-sm hover:bg-muted/40"
            >
              {a.ehPdf ? (
                <FileText className="size-4 shrink-0 text-destructive" />
              ) : (
                <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate" title={a.nome}>
                {a.nome}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmtBytes(a.tamanho)}</span>
              {a.ehPdf && (
                <a
                  href={`/api/p/arquivos/${token}/${a.id}?disposition=inline`}
                  target="_blank"
                  rel="noopener"
                  className="shrink-0 text-primary hover:text-primary/80"
                  title="Visualizar (PDF)"
                  aria-label={`Visualizar ${a.nome}`}
                >
                  <Eye className="size-4" />
                </a>
              )}
              <a
                href={`/api/p/arquivos/${token}/${a.id}`}
                className="shrink-0 text-primary hover:text-primary/80"
                title="Baixar"
                aria-label={`Baixar ${a.nome}`}
              >
                <Download className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ArquivosPublicoView({ token, conteudo }: { token: string; conteudo: ConteudoPublico }) {
  const total = conteudo.disciplinas.reduce((n, d) => n + d.arquivos.length, 0);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{conteudo.projeto.codigo}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{conteudo.projeto.nome}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} arquivo{total === 1 ? "" : "s"} disponível{total === 1 ? "" : "eis"} para visualização e download.
          </p>
        </div>
        <Button render={<a href={`/api/p/arquivos/${token}/zip`} rel="noopener" />}>
          <Download className="size-4" /> Baixar tudo (.zip)
        </Button>
      </div>

      <Card>
        <CardContent className="divide-y p-2">
          {conteudo.disciplinas.map((d) => (
            <Disciplina key={d.id} token={token} disciplina={d} />
          ))}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Acesso somente leitura. Este link pode ser revogado ou expirar a qualquer momento.
      </p>
    </main>
  );
}
