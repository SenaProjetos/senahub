"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Ações do cabeçalho do projeto (Chat, Editar, Duplicar, Gerar documento, ⋯). No computador ficam
 * soltas na linha; no celular ficam atrás de um botão "Ações", para o nome do projeto e as abas
 * aparecerem sem que quatro botões ocupem duas linhas da tela (plano 2026-09-25, 5.1).
 */
export function AcoesProjetoRecolhiveis({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className={cn("flex flex-col items-end gap-2 md:w-auto md:flex-row md:justify-end", aberto && "w-full")}>
      <Button
        variant="outline"
        size="sm"
        className="md:hidden"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        Ações
        <ChevronDown className={cn("size-3.5 transition-transform", aberto && "rotate-180")} aria-hidden />
      </Button>
      <div className={cn("flex-wrap items-center justify-end gap-2 md:flex", aberto ? "flex" : "hidden")}>{children}</div>
    </div>
  );
}
