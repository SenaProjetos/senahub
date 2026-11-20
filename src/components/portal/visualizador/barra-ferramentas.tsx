"use client";

import { Cloud, MapPin, MoveUpRight, PenLine, Ruler, Square, type LucideIcon } from "lucide-react";
import type { TipoMarcacao } from "@/modules/projetos/pendencias/marcacao";
import { cn } from "@/lib/utils";

/** As 6 ferramentas da equipe, com o nome que o cliente entende (spec D2). */
export const FERRAMENTAS_DO_CLIENTE: { tipo: TipoMarcacao; rotulo: string; icone: LucideIcon }[] = [
  { tipo: "ponto", rotulo: "Alfinete", icone: MapPin },
  { tipo: "retangulo", rotulo: "Retângulo", icone: Square },
  { tipo: "seta", rotulo: "Seta", icone: MoveUpRight },
  { tipo: "nuvem", rotulo: "Nuvem", icone: Cloud },
  { tipo: "medida", rotulo: "Cota", icone: Ruler },
  { tipo: "livre", rotulo: "Traço livre", icone: PenLine },
];

/**
 * Barra de ferramentas de marcação do pedido. A cota fica desabilitada, com o motivo à vista, quando a prancha não tem
 * escala definida pela equipe.
 */
export function BarraFerramentas({
  ferramenta,
  onEscolher,
  motivoSemCota,
  idMotivo,
}: {
  ferramenta: TipoMarcacao;
  onEscolher: (t: TipoMarcacao) => void;
  motivoSemCota: string | null;
  /** Id do texto visível que explica a cota desligada (ligado por aria-describedby). */
  idMotivo?: string;
}) {
  return (
    <div role="toolbar" aria-label="Ferramentas de marcação" className="flex flex-wrap items-center gap-1">
      {FERRAMENTAS_DO_CLIENTE.map(({ tipo, rotulo, icone: Icone }) => {
        const desabilitada = tipo === "medida" && motivoSemCota !== null;
        const ativa = ferramenta === tipo;
        return (
          <button
            key={tipo}
            type="button"
            aria-pressed={ativa}
            disabled={desabilitada}
            title={desabilitada ? (motivoSemCota ?? undefined) : rotulo}
            aria-describedby={desabilitada ? idMotivo : undefined}
            onClick={() => onEscolher(tipo)}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium pointer-coarse:h-10",
              "focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
              ativa ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
            )}
          >
            <Icone className="size-4" aria-hidden />
            <span>{rotulo}</span>
          </button>
        );
      })}
    </div>
  );
}
