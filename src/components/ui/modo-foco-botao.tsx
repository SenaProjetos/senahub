"use client";

import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const ATRIBUTO = "data-modo-foco";

/** Disparado por um item de ⋯ para ligar/desligar o modo foco. */
export const EVENTO_MODO_FOCO = "senahub:modo-foco";

/**
 * Modo foco, como no modelo aprovado: no computador recolhe o cabeçalho do projeto; no celular
 * esconde as abas do projeto e a barra de baixo. A regra de CSS está em `globals.css`; o botão fica
 * dentro da área de trabalho, então continua à mão para sair (Esc também sai). No celular é só o
 * ícone.
 */
export function ModoFocoBotao({ className, semBotao = false }: { className?: string; /** Acionado pelo ⋯: não desenha o botão. */ semBotao?: boolean }) {
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
    if (!semBotao) return;
    const alternar = () => aplicar(!document.documentElement.hasAttribute(ATRIBUTO));
    window.addEventListener(EVENTO_MODO_FOCO, alternar);
    return () => window.removeEventListener(EVENTO_MODO_FOCO, alternar);
  }, [semBotao]);

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

  if (semBotao) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      aria-pressed={ativo}
      aria-label={ativo ? "Sair do modo foco" : "Modo foco"}
      title={ativo ? "Sair do modo foco (Esc)" : "Modo foco: recolhe o cabeçalho do projeto"}
      onClick={() => aplicar(!ativo)}
    >
      {ativo ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
      <span className="hidden md:inline">{ativo ? "Sair do foco" : "Foco"}</span>
    </Button>
  );
}
