import { TriangleAlert } from "lucide-react";

/**
 * Alerta do motor de cálculo ("Seção fissurada…", "FCT × FCA < 0,5…"). Ícone e a palavra "Atenção:"
 * (só para leitor de tela) acompanham a cor, para o aviso não depender dela.
 */
export function AlertaCalculo({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-warning-text">
      <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="sr-only">Atenção: </span>
        {children}
      </span>
    </p>
  );
}
