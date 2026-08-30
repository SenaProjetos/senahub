"use client";

import { useState } from "react";
import { AlertTriangle, Info, CircleAlert, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type AlertaUI = {
  credencialId: string;
  nome: string;
  severidade: "critico" | "atencao" | "info";
  mensagem: string;
};

/**
 * §8 — "Atenção necessária", agora como painel vertical à direita da tabela.
 *
 * Vermelho fica reservado ao que está de fato bloqueado ou vencido (§8: "Não usar vermelho para
 * qualquer situação"). "Vence em 22 dias" é âmbar.
 *
 * Mostra 4 e esconde o resto atrás de "Ver todas": a coluna divide altura com o Resumo por
 * status, e uma lista que cresce sem limite empurraria o resumo para fora da primeira dobra.
 */
const ESTILO = {
  critico: { icone: CircleAlert, cor: "text-destructive", fundo: "bg-destructive/10", rotulo: "Crítico" },
  atencao: { icone: AlertTriangle, cor: "text-warning", fundo: "bg-warning/10", rotulo: "Atenção" },
  info: { icone: Info, cor: "text-info", fundo: "bg-info/10", rotulo: "Informação" },
} as const;

const VISIVEIS = 4;

export function PainelAtencao({
  alertas,
  onAbrir,
}: {
  alertas: AlertaUI[];
  onAbrir: (id: string) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  if (alertas.length === 0) return null;

  const lista = expandido ? alertas : alertas.slice(0, VISIVEIS);
  const resto = alertas.length - lista.length;

  return (
    <section aria-labelledby="atencao" className="rounded-lg border bg-card p-3">
      <h2
        id="atencao"
        className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
      >
        Atenção necessária
      </h2>

      <ul className="space-y-1">
        {lista.map((a) => {
          const e = ESTILO[a.severidade];
          const Icone = e.icone;
          return (
            <li key={`${a.credencialId}-${a.mensagem}`}>
              <button
                type="button"
                onClick={() => onAbrir(a.credencialId)}
                className="flex w-full items-start gap-2.5 rounded-md p-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                    e.fundo,
                  )}
                >
                  <Icone className={cn("size-3.5", e.cor)} aria-hidden />
                </span>
                <span className="min-w-0">
                  {/* O rótulo textual acompanha a cor — §60 proíbe depender só dela. */}
                  <span className="block truncate text-sm font-medium">{a.nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    <span className={e.cor}>{e.rotulo}</span> · {a.mensagem}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {(resto > 0 || expandido) && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-8 w-full justify-start px-2 text-xs"
          onClick={() => setExpandido((v) => !v)}
          aria-expanded={expandido}
        >
          <ChevronDown className={cn("size-3.5 transition-transform", expandido && "rotate-180")} aria-hidden />
          {expandido ? "Ver menos" : `Ver todas (${alertas.length})`}
        </Button>
      )}
    </section>
  );
}
