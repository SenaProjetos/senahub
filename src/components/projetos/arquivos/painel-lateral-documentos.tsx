"use client";

import { useAbrirPorEvento } from "@/lib/use-abrir-por-evento";
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
/** Disparado pelo ícone de pastas da barra de ferramentas (celular). */
export const EVENTO_PASTAS = "senahub:arquivos:pastas";

/** Ícone "Pastas e áreas" na linha da busca, no celular (modelo aprovado). */
export function BotaoPastas() {
  return (
    <Button
      variant="outline"
      size="icon"
      className="size-10 shrink-0 md:hidden"
      aria-label="Pastas e áreas"
      title="Pastas e áreas"
      onClick={() => window.dispatchEvent(new Event(EVENTO_PASTAS))}
    >
      <FolderTree className="size-4" />
    </Button>
  );
}

export function PainelLateralDocumentos({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  useAbrirPorEvento(EVENTO_PASTAS, () => setAberto(true));
  const pathname = usePathname();
  // A string, não o objeto: `useSearchParams()` devolve uma instância nova a cada render, e
  // como dependência ela dispararia o efeito sempre — a gaveta fecharia sozinha ao abrir.
  const parametros = useSearchParams().toString();

  // Escolher uma pasta troca a URL: a gaveta fecha sozinha para a pessoa VER o resultado —
  // sem isso ela cobriria a tabela que acabou de ser filtrada.
  useEffect(() => {
    setAberto(false);
  }, [pathname, parametros]);

  return (
    <>
      {/* Gaveta do celular, aberta pelo ícone de pastas da barra (sem caixa própria: numa grade,
        uma caixa vazia ainda ganharia o espaçamento). */}
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="left" className="overflow-y-auto p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Pastas e áreas do projeto</SheetTitle>
            <SheetDescription>Navegue por disciplina, fase e formato, ou abra uma área do projeto.</SheetDescription>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>

      <aside className="hidden rounded-md border border-border bg-card md:block md:max-h-full md:overflow-y-auto">
        {children}
      </aside>
    </>
  );
}
