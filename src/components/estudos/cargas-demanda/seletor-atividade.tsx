"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NBR8995_SECAO_5 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/nbr8995";
import { procurarAtividades } from "@/modules/ferramentas/calc/cargas-demanda/atividades";
import { cn } from "@/lib/utils";

const MAX_RESULTADOS = 40;

/** Atividade do ambiente (lista da NBR ISO/CIE 8995-1). `null` = "outra atividade": o Em é digitado. */
export function SeletorAtividade({
  atividadeId,
  onChange,
  desabilitado,
  rotulo,
}: {
  atividadeId: string | null;
  onChange: (id: string | null) => void;
  desabilitado?: boolean;
  rotulo: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const atual = atividadeId ? NBR8995_SECAO_5.linhas.find((a) => a.id === atividadeId) : undefined;
  const resultados = useMemo(() => (termo.trim() ? procurarAtividades(termo) : [...NBR8995_SECAO_5.linhas]).slice(0, MAX_RESULTADOS), [termo]);

  return (
    <Popover open={aberto} onOpenChange={(v) => { setAberto(v); if (!v) setTermo(""); }}>
      <PopoverTrigger
        disabled={desabilitado}
        aria-label={rotulo}
        className={cn(
          "flex h-8 pointer-coarse:h-10 w-full min-w-40 items-center justify-between gap-1 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
          !atual && "text-muted-foreground",
        )}
      >
        <span className="truncate">{atual ? atual.atividade : "Outra atividade"}</span>
        <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[90vw] gap-2 p-2">
        <Input autoFocus aria-label="Buscar atividade" placeholder="Buscar atividade (ex.: consultório, circulação)" value={termo} onChange={(e) => setTermo(e.target.value)} />
        <ul className="max-h-72 overflow-y-auto text-sm" role="listbox" aria-label="Atividades">
          <li>
            <button
              type="button"
              role="option"
              aria-selected={!atual}
              className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted aria-selected:font-semibold"
              onClick={() => {
                onChange(null);
                setAberto(false);
              }}
            >
              Outra atividade (digitar o Em)
            </button>
          </li>
          {resultados.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                role="option"
                aria-selected={a.id === atividadeId}
                className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted aria-selected:font-semibold"
                onClick={() => {
                  onChange(a.id);
                  setAberto(false);
                }}
              >
                <span className="block">{a.atividade}</span>
                <span className="block text-xs text-muted-foreground">
                  {a.categoria.replace(/^\d+\.\s*/, "")}
                  {a.emLux != null ? ` · ${a.emLux} lux` : ""}
                </span>
              </button>
            </li>
          ))}
          {resultados.length === 0 && <li className="px-2 py-3 text-muted-foreground">Nenhuma atividade encontrada.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
