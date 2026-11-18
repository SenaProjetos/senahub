"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatarNumeroBR, lerNumeroBR } from "@/modules/estudos/cargas-demanda/numero-br";

/**
 * Peças de campo da calculadora de cargas e demanda. As cores seguem a spec §3.2 (mock aprovado):
 * branco = a pessoa preenche; azul = sugerido, pode alterar; cinza = calculado; âmbar = campo obrigatório sem valor
 * padrão ("digite"). Sempre pelos tokens do tema (claro e escuro).
 */

export type Tom = "digitado" | "sugerido" | "calculado" | "alerta";

export const CLASSE_TOM: Record<Tom, string> = {
  digitado: "",
  sugerido: "border-primary/30 bg-primary/10 text-primary dark:text-foreground",
  calculado: "border-transparent bg-muted text-foreground",
  alerta: "border-warning/60 bg-warning/15 text-warning-text",
};

type CampoNumeroProps = {
  valor: number | null;
  /** Chamado a cada digitação com o número lido (`null` = campo esvaziado). Texto que não é número não chama. */
  onChange?: (v: number | null) => void;
  casas?: number;
  /** Máximo de casas mostradas (o valor guardado não perde precisão; só a exibição corta). */
  maximoCasas?: number;
  tom?: Tom;
  /** Texto de apoio quando vazio e obrigatório (âmbar). */
  placeholder?: string;
  somenteLeitura?: boolean;
  desabilitado?: boolean;
  rotulo: string;
  id?: string;
  className?: string;
  /** Sufixo mostrado depois do campo (unidade). */
  unidade?: string;
};

/** Campo numérico com vírgula (pt-BR). Guarda o texto enquanto a pessoa digita e formata ao sair. */
export function CampoNumero({ valor, onChange, casas = 2, maximoCasas, tom = "digitado", placeholder, somenteLeitura, desabilitado, rotulo, id, className, unidade }: CampoNumeroProps) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const calculado = somenteLeitura || tom === "calculado";
  const texto = rascunho ?? (valor == null ? "" : formatarNumeroBR(valor, casas, maximoCasas ?? (calculado ? casas : undefined)));
  // Obrigatório e vazio, sem ser calculado: âmbar com "digite".
  const tomEfetivo: Tom = tom === "digitado" && valor == null && placeholder ? "alerta" : tom;

  return (
    <span className={cn("inline-flex w-full items-center gap-1", className)}>
      <Input
        id={id}
        inputMode="decimal"
        aria-label={rotulo}
        value={texto}
        readOnly={calculado}
        disabled={desabilitado}
        placeholder={placeholder}
        onFocus={(e) => !calculado && e.currentTarget.select()}
        onChange={(e) => {
          if (calculado) return;
          setRascunho(e.target.value);
          const n = lerNumeroBR(e.target.value);
          if (n !== undefined) onChange?.(n);
        }}
        onBlur={() => setRascunho(null)}
        className={cn("text-center tabular-nums", CLASSE_TOM[tomEfetivo], calculado && "pointer-events-none select-text")}
      />
      {unidade && <span className="shrink-0 text-xs text-muted-foreground">{unidade}</span>}
    </span>
  );
}

/** Rótulo pequeno de campo, no estilo do mock. */
export function Rotulo({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("text-xs font-semibold text-muted-foreground", className)}>
      {children}
    </label>
  );
}

/** Legenda das cores dos campos (spec §3.2). */
export function LegendaDasCores() {
  const item = (tom: Tom, texto: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("inline-block size-3.5 rounded-sm border", CLASSE_TOM[tom] || "border-input bg-background")} />
      {texto}
    </span>
  );
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {item("digitado", "Você preenche")}
      {item("sugerido", "Sugerido, pode alterar")}
      {item("calculado", "Calculado")}
      {item("alerta", "Digite")}
    </p>
  );
}
