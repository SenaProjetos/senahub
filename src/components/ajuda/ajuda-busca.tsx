"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, FileText } from "lucide-react";

export type ItemBusca = {
  slug: string;
  titulo: string;
  descricao: string;
  /** Texto extra pesquisável (resumo + tags + palavras-chave + sinônimos), já minúsculo. */
  termos: string;
};

/** Busca client-side sobre o manifesto do manual. */
export function AjudaBusca({ itens }: { itens: ItemBusca[] }) {
  const [q, setQ] = useState("");
  const termo = q.trim().toLowerCase();

  const resultados = useMemo(() => {
    if (termo.length < 2) return [];
    return itens
      .map((it) => {
        const titulo = it.titulo.toLowerCase();
        const score = titulo === termo ? 100 : titulo.includes(termo) ? 50 : it.termos.includes(termo) ? 10 : 0;
        return { it, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => x.it);
  }, [itens, termo]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar no manual (ex.: boleto, ponto, permissão)…"
          className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Buscar no manual"
        />
      </div>

      {termo.length >= 2 && (
        <div className="rounded-md border border-border bg-card">
          {resultados.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum resultado.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {resultados.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/ajuda/${r.slug}`}
                    className="flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/60"
                  >
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{r.titulo}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.descricao}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
