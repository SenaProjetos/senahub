import Link from "next/link";
import { KeyRound, ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { iconeDaCategoria, corDaCategoria, STATUS_LABEL, STATUS_TONE } from "@/modules/acessos/labels";
import { statusCredencial } from "@/modules/acessos/service";
import { cn } from "@/lib/utils";
import type { AcessoDoProjeto } from "@/modules/acessos/queries";

/**
 * §39 — "Acessos relacionados", dentro do projeto.
 *
 * Cada item leva ao cofre; a credencial **não** é exibida aqui e não há botão de revelar. O
 * projeto referencia o cadastro central, não guarda uma segunda via — a spec chama isso de
 * "single source of truth", e na prática significa que revelar continua tendo um caminho só,
 * auditado, na tela de Acessos.
 *
 * A lista já vem filtrada pelo escopo do COFRE (não o do projeto): quem abre a ficha vê aqui
 * apenas o que veria em `/acessos`. Sem isso, o projeto viraria porta lateral para descobrir
 * que credenciais existem.
 *
 * Server component: sem estado, sem ação — só leitura e um link.
 */
export function AcessosDoProjeto({ acessos }: { acessos: AcessoDoProjeto[] }) {
  if (acessos.length === 0) return null;

  const hoje = new Date();

  return (
    <section aria-labelledby="acessos-projeto" className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2
          id="acessos-projeto"
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
        >
          <KeyRound className="size-3" aria-hidden />
          Acessos relacionados
        </h2>
        <Link href="/acessos" className="text-xs text-primary hover:underline">
          Abrir o cofre
        </Link>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {acessos.map((a) => {
          const Icone = iconeDaCategoria(a.categoria.nome);
          const status = statusCredencial(a, hoje);
          return (
            <li key={a.id} className="flex items-start gap-2 rounded-md border p-2">
              <Icone
                className={cn("mt-0.5 size-4 shrink-0", corDaCategoria(a.categoria.nome))}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.nome}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.categoria.nome}
                  {a.estado && a.estado !== "NA" && ` • ${a.estado}`}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge>
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      aria-label={`Abrir portal de ${a.nome} em nova aba`}
                    >
                      <ExternalLink className="size-3" aria-hidden />
                      Portal
                    </a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
