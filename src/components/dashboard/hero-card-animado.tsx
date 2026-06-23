"use client";

import { useEffect, useMemo, useState } from "react";
import { HeroSky, computeSky, getTodLabel } from "@/components/dashboard/hero-sky";
import { HeroCitacao } from "@/components/dashboard/hero-citacao";

// Cores adaptadas ao fundo do céu, para contraste/leitura (WCAG) por horário.
function timeTheme(light: boolean) {
  if (light) {
    return {
      meta: "text-neutral-600",
      heading: "text-neutral-900",
      tag: "text-neutral-700 border-neutral-300/70 bg-black/5",
      nameGradient: "linear-gradient(135deg, #2D4A6E 0%, #4A6E8A 100%)",
    };
  }
  return {
    meta: "text-slate-300",
    heading: "text-slate-50",
    tag: "text-slate-300 border-white/20 bg-white/5",
    nameGradient: "linear-gradient(135deg, #7AAFC8 0%, #A8CAD8 100%)",
  };
}

/**
 * Herocard com a animação do "céu do dia" (HeroSky) de fundo, usando os dados do
 * SenaHub novo (nome do usuário + frase do dia). A hora atualiza ao vivo (30s),
 * fazendo o céu/sol/lua e as cores do texto evoluírem ao longo do dia.
 */
export function HeroCardAnimado({ nome, frase, autor }: { nome: string; frase: string; autor: string }) {
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

  return (
    <section className="relative overflow-hidden rounded-sm border" style={{ minHeight: 176 }}>
      <HeroSky hour={h} />

      <div className="relative z-10 p-6">
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
    </section>
  );
}
