"use client";

import { useState } from "react";
import { AlertTriangle, Info, CircleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type AlertaUI = {
  credencialId: string;
  nome: string;
  severidade: "critico" | "atencao" | "info";
  mensagem: string;
};

/**
 * §8 — "Atenção necessária". Só renderiza quando há item relevante; horizontal e compacta,
 * dispensável pelo usuário.
 *
 * Vermelho é reservado ao que está de fato bloqueado ou vencido (§8: "Não usar vermelho para
 * qualquer situação"). "Vence em 22 dias" é âmbar, não vermelho.
 */
const ESTILO = {
  critico: {
    icone: CircleAlert,
    barra: "border-l-destructive",
    cor: "text-destructive",
    rotulo: "Crítico",
  },
  atencao: {
    icone: AlertTriangle,
    barra: "border-l-warning",
    cor: "text-warning",
    rotulo: "Atenção",
  },
  info: { icone: Info, barra: "border-l-info", cor: "text-info", rotulo: "Informação" },
} as const;

export function AreaAtencao({
  alertas,
  onAbrir,
}: {
  alertas: AlertaUI[];
  onAbrir: (id: string) => void;
}) {
  const [oculto, setOculto] = useState(false);
  if (alertas.length === 0 || oculto) return null;

  const visiveis = alertas.slice(0, 6);
  const resto = alertas.length - visiveis.length;

  return (
    <section aria-labelledby="atencao" className="rounded-md border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2
          id="atencao"
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
        >
          Atenção necessária
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOculto(true)}
          aria-label="Ocultar avisos"
          className="size-7 p-0"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {visiveis.map((a) => {
          const e = ESTILO[a.severidade];
          const Icone = e.icone;
          return (
            <li key={`${a.credencialId}-${a.mensagem}`}>
              <button
                type="button"
                onClick={() => onAbrir(a.credencialId)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-sm border border-l-2 bg-background p-2 text-left",
                  "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  e.barra,
                )}
              >
                <Icone className={cn("mt-0.5 size-4 shrink-0", e.cor)} aria-hidden />
                <span className="min-w-0">
                  {/* O rótulo textual acompanha a cor: §60 proíbe depender só dela. */}
                  <span className="block truncate text-sm font-medium">
                    {a.nome}{" "}
                    <span className={cn("text-xs font-normal", e.cor)}>· {e.rotulo}</span>
                  </span>
                  <span className="block text-xs text-muted-foreground">{a.mensagem}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {resto > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          e mais {resto} {resto === 1 ? "acesso" : "acessos"} pedindo atenção.
        </p>
      )}
    </section>
  );
}
