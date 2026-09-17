"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * O painel esquerdo (árvore de pastas + áreas do projeto) em duas formas:
 *
 *  - telas médias pra cima: coluna fixa ao lado da tabela, como sempre;
 *  - celular: gaveta que abre pelo botão "Pastas" — empilhado, o painel empurrava a tabela
 *    para baixo da dobra e a pessoa rolava a tela inteira antes de ver um documento.
 *
 * Os filhos são renderizados NAS DUAS formas (o CSS esconde a que não vale). São os mesmos
 * componentes de navegação, e o estado deles é local a cada cópia — a seleção de verdade vive
 * na URL, então as duas mostram sempre o mesmo recorte.
 */
export function PainelLateralDocumentos({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();
  const parametros = useSearchParams();

  // Escolher uma pasta troca a URL: a gaveta fecha sozinha para a pessoa VER o resultado —
  // sem isso ela cobriria a tabela que acabou de ser filtrada.
  useEffect(() => {
    setAberto(false);
  }, [pathname, parametros]);

  return (
    <>
      <div className="md:hidden">
        <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
          <FolderTree className="size-3.5" /> Pastas e áreas
        </Button>
        <Sheet open={aberto} onOpenChange={setAberto}>
          <SheetContent side="left" className="overflow-y-auto p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Pastas e áreas do projeto</SheetTitle>
              <SheetDescription>Navegue por disciplina, fase e formato, ou abra uma área do projeto.</SheetDescription>
            </SheetHeader>
            {children}
          </SheetContent>
        </Sheet>
      </div>

      <aside className="hidden rounded-md border border-border bg-card md:block md:sticky md:top-20">
        {children}
      </aside>
    </>
  );
}
