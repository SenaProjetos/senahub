"use client";

import { useSetParams } from "@/lib/use-set-param";
import { cn } from "@/lib/utils";
import { iconeDaCategoria, corDaCategoria } from "@/modules/acessos/labels";

export type CategoriaAtalho = { id: string; nome: string; quantidade: number };

/**
 * §11 — Acesso rápido. Coluna vertical à esquerda da tabela.
 *
 * Clicar APLICA O FILTRO, não navega (§11 é explícito). Por isso é `button` com `aria-pressed`
 * e não link: o alvo é o estado da mesma tela. Clicar de novo desmarca — sem isso, a única
 * saída seria caçar o "Limpar filtros" lá em cima.
 */
export function AcessoRapido({
  categorias,
  categoriaAtiva,
}: {
  categorias: CategoriaAtalho[];
  categoriaAtiva: string;
}) {
  const setParams = useSetParams();
  if (categorias.length === 0) return null;

  return (
    <nav aria-labelledby="acesso-rapido" className="rounded-lg border bg-card p-3">
      <h2
        id="acesso-rapido"
        className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
      >
        Acesso rápido
      </h2>
      <ul className="space-y-1">
        {categorias.map((c) => {
          const Icone = iconeDaCategoria(c.nome);
          const ativo = categoriaAtiva === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setParams({ categoriaId: ativo ? null : c.id })}
                aria-pressed={ativo}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ativo ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent",
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Icone className={cn("size-4", corDaCategoria(c.nome))} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c.nome}</span>
                  <span className="block text-xs tabular-nums text-muted-foreground">
                    {c.quantidade} {c.quantidade === 1 ? "conta" : "contas"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
