"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Faixa de abas dos Resultados. São navegação de verdade (uma rota por aba), então cada uma é um
 * `<a>`: abrir em nova aba e copiar o endereço continuam funcionando. `aria-current` diz qual é a
 * atual — a cor sozinha não diria.
 */
export function ResultadosTabs({ itens }: { itens: readonly { id: string; href: string; rotulo: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Resultados" className="flex flex-wrap gap-1 overflow-x-auto border-b pb-px">
      {itens.map((i) => {
        const atual = pathname === i.href;
        return (
          <Link
            key={i.id}
            href={i.href}
            aria-current={atual ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13.5px] font-medium whitespace-nowrap transition-colors",
              atual ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {i.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
