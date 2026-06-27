"use client";

import { useEffect, useMemo, useState } from "react";
import { Cake, PartyPopper } from "lucide-react";
import { HeroSky, computeSky, getTodLabel } from "@/components/dashboard/hero-sky";
import { HeroCitacao } from "@/components/dashboard/hero-citacao";
import type { Aniversariante } from "@/modules/dashboard/queries";

// Cores adaptadas ao fundo do céu, para contraste/leitura (WCAG) por horário.
function timeTheme(light: boolean) {
  if (light) {
    return {
      meta: "text-neutral-600",
      heading: "text-neutral-900",
      tag: "text-neutral-700 border-neutral-300/70 bg-black/5",
      divider: "border-neutral-300/60",
      nameGradient: "linear-gradient(135deg, #2D4A6E 0%, #4A6E8A 100%)",
    };
  }
  return {
    meta: "text-slate-300",
    heading: "text-slate-50",
    tag: "text-slate-300 border-white/20 bg-white/5",
    divider: "border-white/15",
    nameGradient: "linear-gradient(135deg, #7AAFC8 0%, #A8CAD8 100%)",
  };
}

/**
 * Herocard com a animação do "céu do dia" (HeroSky) de fundo, usando os dados do
 * SenaHub novo (nome do usuário + frase do dia). A hora atualiza ao vivo (30s),
 * fazendo o céu/sol/lua e as cores do texto evoluírem ao longo do dia. No lado
 * direito, mostra o(s) aniversariante(s) do dia (em destaque) e a lista do mês.
 */
export function HeroCardAnimado({
  nome,
  frase,
  autor,
  aniversariantes,
}: {
  nome: string;
  frase: string;
  autor: string;
  aniversariantes: { doDia: Aniversariante[]; doMes: Aniversariante[] };
}) {
  const [hora, setHora] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setHora(d.getHours() + d.getMinutes() / 60);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // Antes de hidratar, usa meio-dia (céu claro) só para o primeiro paint.
  const montado = hora !== null;
  const h = hora ?? 12;
  const sky = useMemo(() => computeSky(h), [h]);
  const theme = timeTheme(sky.textIsLight);
  const saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  // Só após montar (evita mismatch de fuso SSR×cliente na data).
  const dataStr = montado
    ? new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
    : null;

  const { doDia, doMes } = aniversariantes;
  const temAniversario = doDia.length > 0 || doMes.length > 0;

  return (
    <section className="relative overflow-hidden rounded-sm border" style={{ minHeight: 176 }}>
      <HeroSky hour={h} />

      <div className="relative z-10 flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={`font-mono text-[11px] uppercase tracking-[0.18em] ${theme.meta}`}>{saudacao}</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">
            <span className={theme.heading}>{nome}</span>
          </h2>

          <div className="mt-3 flex flex-wrap gap-2">
            {dataStr && (
              <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${theme.tag}`}>
                {dataStr}
              </span>
            )}
            <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${theme.tag}`}>
              {getTodLabel(h)}
            </span>
          </div>

          <HeroCitacao frase={frase} autor={autor} light={sky.textIsLight} />
        </div>

        {/* Aniversariantes — do dia (destaque) + do mês, no lado direito do herocard */}
        {temAniversario && (
          <aside className={`w-full shrink-0 rounded-lg border px-3.5 py-3 sm:w-72 ${theme.tag}`}>
            {doDia.length > 0 && (
              <div className="mb-2.5">
                <div className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${theme.meta}`}>
                  <PartyPopper className="h-3.5 w-3.5" />
                  Aniversariante{doDia.length > 1 ? "s" : ""} do dia
                </div>
                <ul className="mt-1.5 space-y-1">
                  {doDia.map((a) => (
                    <li key={a.id} className="leading-tight">
                      <p className={`text-base font-bold ${theme.heading}`}>🎉 {a.name}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {doMes.length > 0 && (
              <div className={doDia.length > 0 ? `border-t pt-2 ${theme.divider}` : ""}>
                <div className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${theme.meta}`}>
                  <Cake className="h-3.5 w-3.5" />
                  Aniversariantes do mês
                </div>
                <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto pr-1">
                  {doMes.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 leading-tight">
                      <span className={`w-5 shrink-0 text-center font-mono text-[10px] tabular-nums ${theme.meta}`}>
                        {String(a.dia).padStart(2, "0")}
                      </span>
                      <span className={`truncate text-xs ${a.hoje ? `font-semibold ${theme.heading}` : theme.meta}`}>
                        {a.name}
                        {a.hoje && " 🎂"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
