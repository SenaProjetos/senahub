"use client";

import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";

/** Normaliza um caminho POSIX resolvendo "." e ".." (sem tocar o disco). */
function normalizarPosix(p: string): string {
  const partes: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") partes.pop();
    else partes.push(seg);
  }
  return partes.join("/");
}

/**
 * Converte um href interno do manual (relativo, terminando em .md) numa rota /ajuda/...,
 * resolvendo contra o diretório da página atual e preservando a âncora.
 */
function resolverHrefInterno(href: string, baseDir: string): string {
  const [caminho, ancora] = href.split("#");
  const combinado = baseDir ? `${baseDir}/${caminho}` : caminho;
  let alvo = normalizarPosix(combinado)
    .replace(/\/README\.md$/i, "")
    .replace(/^README\.md$/i, "")
    .replace(/\.md$/i, "");
  alvo = alvo.replace(/^\/+/, "");
  const rota = alvo ? `/ajuda/${alvo}` : "/ajuda";
  return ancora ? `${rota}#${ancora}` : rota;
}

function componentes(baseDir: string): Components {
  return {
    h1: ({ children }) => (
      <h1 className="mb-4 mt-2 text-2xl font-extrabold tracking-tight">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="mt-8 mb-3 scroll-mt-20 border-b border-border pb-1.5 text-lg font-bold tracking-tight">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-6 mb-2 scroll-mt-20 text-base font-bold tracking-tight">{children}</h3>
    ),
    p: ({ children }) => <p className="my-3 text-sm leading-relaxed text-foreground/90">{children}</p>,
    ul: ({ children }) => <ul className="my-3 ml-5 list-disc space-y-1 text-sm text-foreground/90">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 ml-5 list-decimal space-y-1 text-sm text-foreground/90">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    blockquote: ({ children }) => (
      <blockquote className="my-4 border-l-2 border-primary/40 bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-6 border-border" />,
    code: ({ className, children }) => {
      const inline = !className;
      return inline ? (
        <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
          {children}
        </code>
      ) : (
        <code className={cn("font-mono text-xs", className)}>{children}</code>
      );
    },
    pre: ({ children }) => (
      <pre className="my-4 overflow-x-auto rounded-md border border-border bg-muted/50 p-3 text-xs">{children}</pre>
    ),
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
    th: ({ children }) => (
      <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {children}
      </th>
    ),
    td: ({ children }) => <td className="border-b border-border/60 px-3 py-2 align-top">{children}</td>,
    a: ({ href, children }) => {
      const h = href ?? "";
      if (/^(https?:|mailto:)/i.test(h)) {
        return (
          <a href={h} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
            {children}
          </a>
        );
      }
      if (h.startsWith("#")) {
        return <a href={h} className="text-primary underline-offset-2 hover:underline">{children}</a>;
      }
      if (h.startsWith("/")) {
        return <Link href={h} className="text-primary underline-offset-2 hover:underline">{children}</Link>;
      }
      return (
        <Link href={resolverHrefInterno(h, baseDir)} className="text-primary underline-offset-2 hover:underline">
          {children}
        </Link>
      );
    },
  };
}

/** Render do corpo markdown de uma página do manual, com links internos reescritos para /ajuda. */
export function MarkdownManual({ corpo, baseDir }: { corpo: string; baseDir: string }) {
  return (
    <div className="min-w-0 max-w-3xl">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={componentes(baseDir)}>
        {corpo}
      </Markdown>
    </div>
  );
}
