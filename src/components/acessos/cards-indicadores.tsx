import { Users, ShieldCheck, Monitor, Lock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Indicadores = {
  total: number;
  portais: number;
  softwares: number;
  restritos: number;
  /** Criados no mês corrente, por card. `null` = ainda não medido. */
  novos?: { total: number; portais: number; softwares: number; restritos: number };
};

/**
 * §7 — os quatro indicadores.
 *
 * Ícone em bloco colorido à esquerda, número grande, rótulo e uma linha de variação. O bloco
 * colorido é o que diferencia os quatro de relance sem pintar o card inteiro (§3 pede tons
 * neutros com cor só em destaque), e usa os tokens de chart do tema — nada de hex novo, para
 * sobreviver ao tema escuro.
 *
 * Os números são do ESCOPO de quem olha, não do cofre inteiro: um contador global diria quantas
 * credenciais existem para quem não alcança nenhuma.
 */
type Card = {
  chave: keyof Omit<Indicadores, "novos">;
  icone: LucideIcon;
  rotulo: string;
  cor: string;
  fundo: string;
};

const CARDS: Card[] = [
  { chave: "total", icone: Users, rotulo: "Contas cadastradas", cor: "text-[var(--chart-1)]", fundo: "bg-[var(--chart-1)]/10" },
  { chave: "portais", icone: ShieldCheck, rotulo: "Portais públicos", cor: "text-[var(--chart-2)]", fundo: "bg-[var(--chart-2)]/10" },
  { chave: "softwares", icone: Monitor, rotulo: "Softwares / Licenças", cor: "text-[var(--chart-3)]", fundo: "bg-[var(--chart-3)]/10" },
  { chave: "restritos", icone: Lock, rotulo: "Acessos restritos", cor: "text-[var(--chart-5)]", fundo: "bg-[var(--chart-5)]/10" },
];

export function CardsIndicadores({ indicadores }: { indicadores: Indicadores }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {CARDS.map((c) => {
        const novos = indicadores.novos?.[c.chave] ?? 0;
        return (
          <div key={c.chave} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg", c.fundo)}>
              <c.icone className={cn("size-5", c.cor)} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-none tabular-nums">{indicadores[c.chave]}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{c.rotulo}</p>
              {indicadores.novos && (
                <p className={cn("mt-0.5 text-[11px] tabular-nums", novos > 0 ? "text-success" : "text-muted-foreground")}>
                  {novos > 0 ? `+${novos} este mês` : "Sem alteração"}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
