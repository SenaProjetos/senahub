"use client";

import { AppWindow, Database, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GENERO_META, GENEROS, type FiltroGenero, type Genero } from "@/lib/permissao-genero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Peças visuais compartilhadas pelas duas telas de matriz de permissão. */

const ICONE: Record<Genero, typeof AppWindow> = {
  tela: AppWindow,
  acao: SlidersHorizontal,
  dados: Database,
};

/**
 * `descritivo` põe a explicação num `title` nativo em vez de Tooltip — para quando o selo fica
 * dentro de um `<label>` clicável, onde um gatilho de tooltip disputaria o clique com o controle.
 */
export function SeloGenero({
  genero,
  className,
  descritivo,
}: {
  genero: Genero;
  className?: string;
  descritivo?: boolean;
}) {
  const meta = GENERO_META[genero];
  const Icone = ICONE[genero];
  return (
    <span
      title={descritivo ? meta.descricao : undefined}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-[10px] font-semibold tracking-wide uppercase",
        meta.classe,
        className,
      )}
    >
      <Icone className="size-3" />
      {meta.rotulo}
    </span>
  );
}

/** Os três cards de legenda — a resposta a "o que é tela e o que é funcionalidade?". */
export function LegendaGeneros() {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {GENEROS.map((g) => (
        <div key={g} className={cn("rounded-sm border border-l-2 bg-card p-3", GENERO_META[g].borda)}>
          <div className="flex items-center gap-1.5">
            <SeloGenero genero={g} />
            <span className="text-sm font-semibold">{GENERO_META[g].titulo}</span>
          </div>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{GENERO_META[g].descricao}</p>
        </div>
      ))}
    </div>
  );
}

export function BuscaPermissao({
  valor,
  onChange,
  className,
}: {
  valor: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-56 flex-1", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar recurso, permissão ou tela…"
        className="pl-8"
        aria-label="Buscar permissão"
      />
      {valor && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-1 size-6 -translate-y-1/2"
          onClick={() => onChange("")}
          aria-label="Limpar busca"
        >
          <X />
        </Button>
      )}
    </div>
  );
}

const OPCOES: [FiltroGenero, string][] = [
  ["tudo", "Tudo"],
  ["tela", "Telas"],
  ["acao", "Funcionalidades"],
  ["dados", "Dados"],
];

export function FiltroGeneros({
  valor,
  onChange,
}: {
  valor: FiltroGenero;
  onChange: (v: FiltroGenero) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-sm border p-0.5">
      <SlidersHorizontal className="mx-1.5 size-3.5 text-muted-foreground" aria-hidden />
      {OPCOES.map(([opcao, rotulo]) => (
        <Button
          key={opcao}
          size="xs"
          variant={valor === opcao ? "secondary" : "ghost"}
          onClick={() => onChange(opcao)}
          aria-pressed={valor === opcao}
        >
          {rotulo}
        </Button>
      ))}
    </div>
  );
}

/** Selo secundário da linha de tela que também escreve (ex.: `configuracoes:gerir`). */
export function SeloAlteraDados() {
  return (
    <span className="rounded-sm border px-1 text-[10px] text-muted-foreground">altera dados</span>
  );
}
