"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Filtros de uma lista: soltos numa linha a partir de `md`; no celular viram um botão
 * "Filtros · N" que abre uma gaveta por baixo (plano 2026-09-25, 4.2). A busca por texto fica
 * FORA daqui, sempre à vista.
 *
 * O mesmo `children` é montado nos dois lugares, mas o da gaveta só existe com ela aberta e o da
 * linha fica escondido por CSS no celular — sem piscar na primeira pintura, que é o que uma troca
 * por `matchMedia` faria. Por isso os filhos devem guardar o estado na URL (como as listas já
 * fazem), não em `useState` local.
 */
export function FiltrosGaveta({
  ativos,
  children,
  className,
}: {
  /** Quantos filtros estão fora do padrão — vira o número no botão. */
  ativos: number;
  children: React.ReactNode;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <div className={cn("hidden items-center gap-2 md:flex md:flex-wrap", className)}>{children}</div>

      <Button variant="outline" size="sm" className="md:hidden" onClick={() => setAberto(true)}>
        <SlidersHorizontal className="size-3.5" />
        Filtros{ativos > 0 ? ` · ${ativos}` : ""}
      </Button>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="bottom" className="max-h-[85svh] rounded-t-xl">
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>As mudanças valem na hora.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-2 [&_[data-slot=select-trigger]]:w-full [&>*]:w-full">
            {children}
          </div>
          <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button className="w-full" onClick={() => setAberto(false)}>
              Ver resultados
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
