"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock3, MapPin } from "lucide-react";
import { buscarAgendaHoje } from "@/modules/agenda/actions";
import type { CompromissoResumo } from "@/modules/agenda/queries";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function horaLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Relógio do header (dia + hora ao vivo) que, ao ser clicado, abre um Popover
 * com o resumo dos compromissos de HOJE do usuário. Segue o padrão do sininho
 * de notificações (Popover base-ui).
 */
export function AgendaResumo() {
  const [now, setNow] = useState<Date | null>(null);
  const [itens, setItens] = useState<CompromissoResumo[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  async function carregar() {
    setCarregando(true);
    try {
      setItens(await buscarAgendaHoje());
    } finally {
      setCarregando(false);
    }
  }

  const label = now
    ? `${now.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : "--:--";

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) void carregar();
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Resumo da agenda de hoje"
            className="flex items-center gap-1.5 rounded-sm px-1.5 py-1 font-mono text-xs tabular-nums text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarDays className="size-3.5" />
            {label}
          </button>
        }
      />
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Agenda de hoje</span>
          <Link
            href="/agenda"
            className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            Ver tudo →
          </Link>
        </div>
        <div className="max-h-96 overflow-y-auto overscroll-contain p-2">
          {carregando && itens === null ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : !itens || itens.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Nenhum compromisso para hoje.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {itens.map((c) => (
                <li key={c.id} className="rounded-sm px-2 py-1.5 hover:bg-muted/60">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1 size-2 shrink-0 rounded-full ${
                        c.confirmado === false
                          ? "bg-muted-foreground/40"
                          : c.confirmado
                            ? "bg-success"
                            : "bg-primary"
                      }`}
                      title={
                        c.confirmado === false
                          ? "Recusado"
                          : c.confirmado
                            ? "Confirmado"
                            : "Pendente"
                      }
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.titulo}</p>
                      <p className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3" />
                          {horaLabel(c.inicio)}
                          {c.fim ? `–${horaLabel(c.fim)}` : ""}
                        </span>
                        {c.local && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <MapPin className="size-3" /> {c.local}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
