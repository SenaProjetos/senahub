"use client";

import { useEffect, useState } from "react";
import { MousePointerClick } from "lucide-react";

import { prazoVencido } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Balão temporário que ensina o menu de contexto (botão direito / toque longo) nas telas que
 * ganharam um. Some sozinha depois desta data — comparação por dia-calendário, via `lib/data`.
 *
 * **Provisória de propósito:** a data aqui é um teto folgado para o teste manual; o checklist de
 * release troca pela data do deploy + 7 dias e abre a issue que apaga este componente. Se você
 * está lendo isto muito depois, o arquivo deveria ter sido removido.
 */
export const DICA_MENU_CONTEXTO_ATE = "2027-12-31";

const CHAVE = "senahub:dica-menu-contexto";

export function DicaMenuContexto({ className }: { className?: string }) {
  // Nasce escondida e só aparece depois de montar: a decisão depende de `localStorage`, que não
  // existe no servidor — decidir na primeira renderização daria divergência de hidratação.
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (prazoVencido(DICA_MENU_CONTEXTO_ATE)) return;
    try {
      if (localStorage.getItem(CHAVE) === "visto") return;
    } catch {
      // Janela privada ou storage bloqueado: mostra a dica, apenas não lembra da dispensa.
    }
    setVisivel(true);
  }, []);

  if (!visivel) return null;

  function dispensar() {
    setVisivel(false);
    try {
      localStorage.setItem(CHAVE, "visto");
    } catch {
      // Sem storage a dica volta no próximo carregamento — melhor que quebrar o clique.
    }
  }

  // Balão por cima do começo da lista (modelo aprovado): altura zero no fluxo, então não rouba
  // linha nenhuma — nem a pílula de antes. Some com "Entendi" e não volta.
  return (
    <div className={cn("relative z-20 my-0 h-0", className)}>
      <div
        role="status"
        className="absolute top-2 left-2 flex max-w-xs items-start gap-2 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground shadow-lg"
      >
        <MousePointerClick className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <p className="text-pretty">
          <b>Novidade:</b>{" "}
          <span className="pointer-coarse:hidden">clique com o botão direito numa linha para ver as ações.</span>
          <span className="hidden pointer-coarse:inline">toque e segure um cartão para ver as ações.</span>
          <button
            type="button"
            onClick={dispensar}
            className="ml-2 font-semibold underline-offset-2 opacity-90 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary-foreground"
          >
            Entendi
          </button>
        </p>
      </div>
    </div>
  );
}
