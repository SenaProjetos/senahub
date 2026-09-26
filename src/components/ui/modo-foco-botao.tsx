"use client";

import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ATRIBUTO = "data-modo-foco";

/**
 * Modo foco: esconde o menu lateral, a barra do topo e o cabeçalho do projeto para dar a tela
 * inteira à tabela ou ao visualizador. A regra de CSS está em `globals.css`; o botão fica dentro da
 * área de trabalho, então continua à mão para sair (Esc também sai). Só no computador.
 */
export function ModoFocoBotao({ className }: { className?: string }) {
  const [ativo, setAtivo] = useState(false);

  function aplicar(novo: boolean) {
    setAtivo(novo);
    const raiz = document.documentElement;
    if (novo) raiz.setAttribute(ATRIBUTO, "");
    else raiz.removeAttribute(ATRIBUTO);
    // Quem mede a altura disponível (useAlturaRestante) reage ao `resize`.
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.documentElement.hasAttribute(ATRIBUTO)) aplicar(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      // Sair da tela nunca deixa o sistema sem menu.
      document.documentElement.removeAttribute(ATRIBUTO);
    };
  }, []);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("hidden md:inline-flex", className)}
      aria-pressed={ativo}
      title={ativo ? "Sair do modo foco (Esc)" : "Modo foco: esconde menu e cabeçalhos"}
      onClick={() => aplicar(!ativo)}
    >
      {ativo ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
      {ativo ? "Sair do foco" : "Foco"}
    </Button>
  );
}
