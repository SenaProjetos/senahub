"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useSetParams } from "@/lib/use-set-param";

const DEBOUNCE_MS = 350;

/**
 * Busca do diretório geral. Vai para a URL (`?q=`) e o servidor filtra — o mesmo caminho da aba
 * do projeto, onde o recorte também acontece no Postgres. A pausa antes de empurrar evita uma
 * navegação por tecla digitada.
 */
export function BuscaGlobal() {
  const sp = useSearchParams();
  const setParams = useSetParams();
  const q = sp.get("q") ?? "";
  const [texto, setTexto] = useState(q);

  // Sincroniza quando a URL muda por fora (voltar no navegador, clique em outra pasta).
  useEffect(() => setTexto(q), [q]);

  useEffect(() => {
    if (texto === q) return;
    const timer = setTimeout(() => setParams({ q: texto.trim() || null }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [texto, q, setParams]);

  return (
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar documento, arquivo ou autor"
        aria-label="Buscar documento, arquivo ou autor"
        className="h-9 w-full rounded-md border border-border bg-background pr-8 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {texto && (
        <button
          type="button"
          onClick={() => setTexto("")}
          aria-label="Limpar busca"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
