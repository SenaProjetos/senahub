"use client";

import { Clock } from "lucide-react";
import { iconeDaCategoria, corDaCategoria } from "@/modules/acessos/labels";
import { formatarDataHora } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type AcessoRecente = {
  id: string;
  nome: string;
  categoria: { nome: string };
  usadoEm: Date;
};

/**
 * §42 — "Acessados recentemente".
 *
 * É a atividade do PRÓPRIO usuário, e só dele: a query filtra pelo `userId` da sessão, porque
 * §42 é explícito que a seção não pode expor o que os outros andaram usando. Isso não é
 * otimização — é o requisito.
 *
 * "Recente" conta revelar/copiar, não abrir o cadastro: espiar a ficha não é usar a credencial,
 * e incluir isso encheria a lista de coisas que a pessoa só olhou de passagem.
 */
export function PainelRecentes({
  recentes,
  onAbrir,
}: {
  recentes: AcessoRecente[];
  onAbrir: (id: string) => void;
}) {
  if (recentes.length === 0) return null;

  return (
    <section aria-labelledby="recentes" className="rounded-lg border bg-card p-3">
      <h2
        id="recentes"
        className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
      >
        <Clock className="size-3" aria-hidden />
        Usados por você
      </h2>
      <ul className="space-y-0.5">
        {recentes.map((r) => {
          const Icone = iconeDaCategoria(r.categoria.nome);
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onAbrir(r.id)}
                className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icone
                  className={cn("size-4 shrink-0", corDaCategoria(r.categoria.nome))}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{r.nome}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {formatarDataHora(r.usadoEm)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
