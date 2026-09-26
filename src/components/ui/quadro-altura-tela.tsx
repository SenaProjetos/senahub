"use client";

import { useAlturaRestante } from "@/lib/use-altura-restante";

/**
 * Área que ocupa a altura que sobra na tela (a partir de `md`) e deixa os filhos rolarem por
 * dentro. Existe para páginas de servidor, que não podem usar `useAlturaRestante` direto.
 */
export function QuadroAlturaTela({
  className,
  children,
  minimo,
  folga,
}: {
  className?: string;
  children: React.ReactNode;
  minimo?: number;
  folga?: number;
}) {
  const { ref, style } = useAlturaRestante<HTMLDivElement>({ minimo, folga });
  return (
    <div ref={ref} style={style} className={className}>
      {children}
    </div>
  );
}
