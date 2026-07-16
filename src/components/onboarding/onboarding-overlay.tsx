"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PassoGuia } from "@/components/onboarding/coachmarks";

/**
 * Overlay visual do guia (spotlight + tooltip), sem lib. Recebe passos JÁ filtrados
 * para os que existem na tela. Mede o alvo ao vivo (scroll/resize/troca de passo),
 * destaca com um "furo" via box-shadow e posiciona o balão abaixo (ou acima, se não
 * couber). `onFechar(concluido)` distingue "Concluir/Pular" (marca visto) de nada.
 */

type Ret = { top: number; left: number; width: number; height: number };

const MARGEM = 8; // respiro do furo ao redor do alvo
const BALAO_W = 320;

export function OnboardingOverlay({
  passos,
  onFechar,
}: {
  passos: PassoGuia[];
  onFechar: (concluido: boolean) => void;
}) {
  const [i, setI] = useState(0);
  const [ret, setRet] = useState<Ret | null>(null);
  const passo = passos[i];
  const ultimo = i === passos.length - 1;

  const medir = useCallback(() => {
    if (!passo) return;
    const el = document.querySelector(passo.alvo);
    if (!(el instanceof HTMLElement)) {
      setRet(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRet({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [passo]);

  // Traz o alvo para a viewport e mede após o scroll assentar.
  useLayoutEffect(() => {
    const el = document.querySelector(passo?.alvo ?? "");
    if (el instanceof HTMLElement) el.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(medir, 260);
    return () => clearTimeout(t);
  }, [passo, medir]);

  useEffect(() => {
    const on = () => medir();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
  }, [medir]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar(true);
      else if (e.key === "ArrowRight") setI((v) => Math.min(passos.length - 1, v + 1));
      else if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [passos.length, onFechar]);

  if (!passo) return null;

  // Posição do balão: abaixo do alvo se couber, senão acima; centralizado e preso à viewport.
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  let baloTop = 0;
  let baloLeft = 0;
  if (ret) {
    const abaixo = ret.top + ret.height + MARGEM + 180 < vh;
    baloTop = abaixo ? ret.top + ret.height + MARGEM + 6 : Math.max(12, ret.top - MARGEM - 6 - 200);
    baloLeft = Math.min(Math.max(12, ret.left + ret.width / 2 - BALAO_W / 2), vw - BALAO_W - 12);
  } else {
    baloTop = vh / 2 - 100;
    baloLeft = vw / 2 - BALAO_W / 2;
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Guia da tela">
      {/* Captura cliques para não interagir com a tela por baixo durante o guia. */}
      <div className="absolute inset-0" onClick={() => {}} />

      {/* Spotlight: furo no alvo via box-shadow gigante. */}
      {ret ? (
        <div
          className="pointer-events-none absolute rounded-md ring-2 ring-primary transition-all duration-200"
          style={{
            top: ret.top - MARGEM,
            left: ret.left - MARGEM,
            width: ret.width + MARGEM * 2,
            height: ret.height + MARGEM * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/55" />
      )}

      {/* Balão */}
      <div
        className="absolute rounded-lg border bg-popover p-4 text-popover-foreground shadow-xl"
        style={{ top: baloTop, left: baloLeft, width: BALAO_W }}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold">{passo.titulo}</h3>
          <button
            type="button"
            onClick={() => onFechar(true)}
            aria-label="Fechar guia"
            className="-mr-1 -mt-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{passo.texto}</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {passos.map((_, idx) => (
              <span
                key={idx}
                className={idx === i ? "size-1.5 rounded-full bg-primary" : "size-1.5 rounded-full bg-muted-foreground/30"}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setI((v) => v - 1)}>
                Anterior
              </Button>
            )}
            {!ultimo && (
              <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => onFechar(true)}>
                Pular
              </Button>
            )}
            <Button size="sm" className="h-8" onClick={() => (ultimo ? onFechar(true) : setI((v) => v + 1))}>
              {ultimo ? "Concluir" : "Próximo"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
