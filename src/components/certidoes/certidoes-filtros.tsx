"use client";

import { Search, SlidersHorizontal, X, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  contarFiltrosAtivos,
  ORDEM_LABEL,
  type Aba,
  type Filtros,
  type Ordem,
  type Responsavel,
  type Tipo,
} from "@/components/certidoes/tipos";

const TODOS = "__todos";

/**
 * §9 (filtros) + §10 (busca) + §17 (abas) + o seletor de ordem do §8.
 *
 * Estado é `useState` no orquestrador, NÃO `useSetParams`/URL como em `acessos-filtros.tsx`. A
 * divergência é deliberada: /acessos pagina no servidor, então cada filtro precisa virar consulta;
 * aqui a lista inteira já veio num único carregamento, e trocar filtro por navegação seria um
 * round-trip por clique para reordenar dado que já está na memória (§24).
 */
export function CertidoesFiltros({
  filtros,
  onFiltrar,
  onLimpar,
  aba,
  onAba,
  totais,
  ordem,
  onOrdem,
  tipos,
  responsaveis,
}: {
  filtros: Filtros;
  onFiltrar: (parcial: Partial<Filtros>) => void;
  onLimpar: () => void;
  aba: Aba;
  onAba: (a: Aba) => void;
  totais: { todas: number; excluidas: number; visiveis: number };
  ordem: Ordem;
  onOrdem: (o: Ordem) => void;
  tipos: Tipo[];
  responsaveis: Responsavel[];
}) {
  const ativos = contarFiltrosAtivos(filtros);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* §17 — sobraram como aba só os recortes que os cards do §3 não cobrem. */}
        <div className="flex gap-1.5">
          <BotaoAba ativo={aba === "todas"} onClick={() => onAba("todas")}>
            Todas ({totais.todas})
          </BotaoAba>
          <BotaoAba ativo={aba === "excluidas"} onClick={() => onAba("excluidas")}>
            Excluídas ({totais.excluidas})
          </BotaoAba>
        </div>

        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={filtros.busca}
            onChange={(e) => onFiltrar({ busca: e.target.value })}
            placeholder="Buscar certidão..."
            aria-label="Buscar certidão por tipo, descrição ou responsável"
            className="pl-9"
            disabled={aba === "excluidas"}
          />
        </div>

        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm" disabled={aba === "excluidas"}>
                <SlidersHorizontal className="size-4" aria-hidden />
                Filtrar
                {ativos > 0 && (
                  <span className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums">
                    {ativos}
                  </span>
                )}
              </Button>
            }
          />
          <PopoverContent align="end" className="w-72 space-y-3">
            <Campo
              rotulo="Situação"
              valor={filtros.situacao}
              onChange={(v) => onFiltrar({ situacao: (v ?? "") as Filtros["situacao"] })}
              opcoes={[
                { valor: "vencida", rotulo: "Vencidas" },
                { valor: "vence_em_breve", rotulo: "Vencem em breve" },
                { valor: "ok", rotulo: "OK" },
              ]}
            />
            {/* §5 — documento é dimensão própria, não um valor de situação. */}
            <Campo
              rotulo="Documento"
              valor={filtros.documento}
              onChange={(v) => onFiltrar({ documento: (v ?? "") as Filtros["documento"] })}
              opcoes={[
                { valor: "com", rotulo: "Com documento" },
                { valor: "sem", rotulo: "Sem documento" },
              ]}
            />
            <Campo
              rotulo="Obrigatoriedade"
              valor={filtros.obrigatoriedade}
              onChange={(v) => onFiltrar({ obrigatoriedade: (v ?? "") as Filtros["obrigatoriedade"] })}
              opcoes={[
                { valor: "obrigatorias", rotulo: "Obrigatórias" },
                { valor: "opcionais", rotulo: "Opcionais" },
              ]}
            />
            <Campo
              rotulo="Responsável"
              valor={filtros.responsavelId}
              onChange={(v) => onFiltrar({ responsavelId: v ?? "" })}
              opcoes={[
                { valor: "__sem", rotulo: "Sem responsável" },
                ...responsaveis.map((r) => ({ valor: r.id, rotulo: r.name })),
              ]}
            />
            <Campo
              rotulo="Tipo"
              valor={filtros.tipoId}
              onChange={(v) => onFiltrar({ tipoId: v ?? "" })}
              opcoes={tipos.map((t) => ({ valor: t.id, rotulo: t.nome }))}
            />
          </PopoverContent>
        </Popover>

        {/* §8 — a ordem padrão é por prioridade, mas o usuário não perde o controle manual. */}
        <Select value={ordem} onValueChange={(v) => v && onOrdem(v as Ordem)}>
          <SelectTrigger className="h-9 w-auto min-w-40" aria-label="Ordenar por">
            <ArrowUpDown className="size-3.5 text-muted-foreground" aria-hidden />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ORDEM_LABEL).map(([v, rotulo]) => (
              <SelectItem key={v} value={v}>
                {rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {ativos > 0 && aba === "todas" && (
          <Button variant="ghost" size="sm" onClick={onLimpar}>
            <X className="size-4" aria-hidden />
            Limpar filtros
          </Button>
        )}
      </div>

      {ativos > 0 && aba === "todas" && (
        <p className="text-xs text-muted-foreground" role="status">
          Mostrando {totais.visiveis} de {totais.todas} certidões.
        </p>
      )}
    </div>
  );
}

function BotaoAba({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "rounded-sm border px-2.5 py-1 text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ativo ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

/** Rótulo em cima, valor dentro — mesma forma de `acessos-filtros.tsx`. "Todos" limpa a dimensão. */
function Campo({
  rotulo,
  valor,
  onChange,
  opcoes,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string | null) => void;
  opcoes: Array<{ valor: string; rotulo: string }>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{rotulo}</span>
      <Select
        value={valor || TODOS}
        // base-ui entrega `string | null`, diferente do Radix — gotcha do CLAUDE.md.
        onValueChange={(v) => onChange(!v || v === TODOS ? null : v)}
      >
        <SelectTrigger className="h-9 w-full" aria-label={rotulo}>
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos</SelectItem>
          {opcoes.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
