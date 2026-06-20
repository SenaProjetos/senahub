"use client";

import { useEffect, useState } from "react";
import { Quote, X } from "lucide-react";

/**
 * Bloco da citação do dia. Pode ser ocultado pelo usuário (botão "×");
 * a preferência persiste em localStorage (chave "ocultarCitacao").
 */
export function HeroCitacao({ frase, autor }: { frase: string; autor: string }) {
  // Começa oculto até hidratar para evitar "flash" se o usuário já dispensou.
  const [pronto, setPronto] = useState(false);
  const [oculta, setOculta] = useState(false);

  useEffect(() => {
    setOculta(localStorage.getItem("ocultarCitacao") === "1");
    setPronto(true);
  }, []);

  function ocultar() {
    setOculta(true);
    try {
      localStorage.setItem("ocultarCitacao", "1");
    } catch {
      // ignora ambientes sem localStorage
    }
  }

  if (!pronto || oculta) return null;

  return (
    <figure className="relative mt-5 flex max-w-2xl items-start gap-3 pr-7">
      <Quote className="mt-0.5 size-5 shrink-0 text-primary/60" />
      <div>
        <blockquote className="text-sm leading-relaxed text-foreground/90">{frase}</blockquote>
        <figcaption className="mt-1 text-xs text-muted-foreground">— {autor}</figcaption>
      </div>
      <button
        type="button"
        onClick={ocultar}
        aria-label="Ocultar citação"
        className="absolute right-0 top-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </figure>
  );
}
