"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ABA_LABEL,
  ABAS_CONFIGURAVEIS,
  aplicarConfigAbas,
  ordenarPorAtividade,
  type AbaConfigItem,
} from "@/modules/projetos/abas";

const TODAS_ABAS = ["", ...ABAS_CONFIGURAVEIS] as const;

export function ProjetoTabNav({
  projetoId,
  abasVisiveis = TODAS_ABAS,
  abasConfig,
  conteudoPorAba,
}: {
  projetoId: string;
  abasVisiveis?: readonly string[];
  /** Personalização de ordem/visibilidade salva no projeto (editada em "Editar projeto"). */
  abasConfig?: AbaConfigItem[] | null;
  /** Suffix → tem alguma entrada registrada. Ausente/omitido = não avalia (aba sempre "normal"). */
  conteudoPorAba?: Record<string, boolean>;
}) {
  const pathname = usePathname();
  const base = `/projetos/${projetoId}`;
  const ordem = useMemo(() => {
    const base = aplicarConfigAbas(abasVisiveis, abasConfig);
    return ordenarPorAtividade(base, conteudoPorAba);
  }, [abasVisiveis, abasConfig, conteudoPorAba]);

  return (
    <nav
      className="flex gap-0 overflow-x-auto border-b scrollbar-none"
      aria-label="Seções do projeto"
    >
      {ordem.map((suffix) => {
        const label = ABA_LABEL[suffix as "" | (typeof ABAS_CONFIGURAVEIS)[number]];
        const href = `${base}${suffix}`;
        const isActive = suffix === "" ? pathname === base : pathname === href;
        // undefined = não avaliada (Visão Geral/Histórico); false = módulo ainda não usado neste projeto.
        const vazia = conteudoPorAba?.[suffix] === false;
        return (
          <Link
            key={suffix}
            href={href}
            title={vazia ? `${label} — nenhuma entrada registrada neste projeto` : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
              vazia && !isActive && "italic text-muted-foreground/60",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {label}
            {vazia && <span className="sr-only"> — nenhuma entrada registrada neste projeto</span>}
          </Link>
        );
      })}
    </nav>
  );
}
