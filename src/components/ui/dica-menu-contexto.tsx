"use client";

import { useEffect, useState } from "react";
import { MousePointerClick } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

  // Balão, não faixa: a faixa de largura inteira roubava uma linha de altura em 17 telas. A pílula
  // ocupa uma linha curta e o texto só aparece se a pessoa abrir.
  return (
    <div className={cn("flex", className)}>
      <Popover defaultOpen={false}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="inline-flex h-6 items-center gap-1.5 rounded-full border border-dashed bg-muted/40 px-2.5 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-8"
            >
              <MousePointerClick className="size-3.5 shrink-0" aria-hidden />
              <span className="font-medium text-foreground">Novidade</span>
              <span className="hidden sm:inline">· menu de ações no botão direito</span>
            </button>
          }
        />
        <PopoverContent align="start" className="w-72 text-sm">
          <p className="text-pretty">
            Clique com o botão direito em uma linha, um cartão ou um arquivo para ver as ações. No
            celular, toque e segure.
          </p>
          <Button type="button" size="sm" className="mt-2" onClick={dispensar}>
            Entendi
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
