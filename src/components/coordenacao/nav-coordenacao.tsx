"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { abasDaCoordenacao } from "@/modules/coordenacao/nav";
import { cn } from "@/lib/utils";

/**
 * Abas internas da Coordenação: Modelo 3D (IFC) | Sobreposição 2D. A ativa vem da rota — a
 * sobreposição tem endereço próprio; qualquer outra rota da Coordenação é o 3D.
 */
export function NavCoordenacao({ projetoId, className }: { projetoId: string; className?: string }) {
  const pathname = usePathname();
  const ativa = pathname.includes("/coordenacao/sobreposicao") ? "sobreposicao" : "3d";

  return (
    <nav aria-label="Seções da Coordenação" className={cn("flex gap-1 overflow-x-auto scrollbar-none", className)}>
      {abasDaCoordenacao(projetoId).map((aba) => (
        <Link
          key={aba.id}
          href={aba.href}
          aria-current={aba.id === ativa ? "page" : undefined}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
            aba.id === ativa
              ? "bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {aba.rotulo}
        </Link>
      ))}
    </nav>
  );
}
