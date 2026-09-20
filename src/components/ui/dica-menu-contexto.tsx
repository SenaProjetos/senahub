"use client";

import { useEffect, useState } from "react";
import { MousePointerClick } from "lucide-react";

import { Button } from "@/components/ui/button";
import { prazoVencido } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Faixa temporária que ensina o menu de contexto (botão direito / toque longo) nas telas que
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

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-sm border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <MousePointerClick className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 text-pretty">
        <span className="font-medium text-foreground">Novidade:</span> clique com o botão direito
        em uma linha, um cartão ou um arquivo para ver as ações. No celular, toque e segure.
      </p>
      <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0" onClick={dispensar}>
        Entendi
      </Button>
    </div>
  );
}
