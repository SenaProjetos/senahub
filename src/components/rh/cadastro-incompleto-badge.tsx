"use client";

import { AlertTriangle } from "lucide-react";
import type { CampoFaltante } from "@/modules/rh/pessoas/completude";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Badge "incompleto" clicável: abre a lista exata dos campos obrigatórios vazios. Usada tanto
 * na tabela de `/rh/pessoas` quanto no cabeçalho da ficha 360 — mesmo dado (`camposFaltantes`),
 * duas aparências (a ficha passa `className` maior).
 */
export function CadastroIncompletoBadge({
  camposFaltantes,
  label = "incompleto",
  className,
}: {
  camposFaltantes: CampoFaltante[];
  label?: string;
  className?: string;
}) {
  if (camposFaltantes.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button type="button">
            <Badge
              variant="outline"
              className={`ml-2 cursor-pointer align-middle border-warning text-warning hover:bg-warning/10 ${className ?? ""}`}
            >
              {label}
            </Badge>
          </button>
        }
      />
      <PopoverContent align="start" className="w-64">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Campos obrigatórios vazios</p>
            <ul className="space-y-0.5 text-sm text-muted-foreground">
              {camposFaltantes.map((c) => (
                <li key={c.campo}>{c.label}</li>
              ))}
            </ul>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
