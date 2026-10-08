"use client";

import { useId, useState } from "react";
import { useSetParams } from "@/lib/use-set-param";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ATALHOS, intervaloDoAtalho, motivoIntervaloInvalido, type Periodo } from "@/modules/rh/produtividade/periodo";
import { cn } from "@/lib/utils";

/** Atalhos + intervalo livre. Grava `?de=&ate=` na URL; o servidor resolve e corta o futuro. */
export function SeletorPeriodo({ periodo, hoje }: { periodo: Periodo; hoje: string }) {
  const setParams = useSetParams();
  const idMotivo = useId();
  const [de, setDe] = useState(periodo.de);
  const [ate, setAte] = useState(periodo.ate);
  // Mesma regra do servidor: o que não passa aqui, lá voltaria calado aos 14 dias.
  const motivo = motivoIntervaloInvalido(de, ate, hoje);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap rounded-sm border p-0.5 text-sm" role="group" aria-label="Período">
        {ATALHOS.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={periodo.atalho === a.id}
            onClick={() => setParams(intervaloDoAtalho(a.id, hoje))}
            className={cn(
              "rounded-sm px-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              periodo.atalho === a.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!motivo) setParams({ de, ate });
        }}
      >
        <label className="grid gap-1 text-xs text-muted-foreground">
          De
          <Input type="date" value={de} max={hoje} onChange={(e) => setDe(e.target.value)} className="h-8 w-[9.5rem]" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Até
          <Input type="date" value={ate} max={hoje} onChange={(e) => setAte(e.target.value)} className="h-8 w-[9.5rem]" />
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={motivo !== null} aria-describedby={motivo ? idMotivo : undefined}>
          Aplicar
        </Button>
        {motivo && (de !== periodo.de || ate !== periodo.ate) && (
          <p id={idMotivo} role="status" className="w-full text-xs text-destructive">
            {motivo}
          </p>
        )}
      </form>
    </div>
  );
}
