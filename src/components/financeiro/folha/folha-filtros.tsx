"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { useSetParams } from "@/lib/use-set-param";
import { formatarCodigo } from "@/modules/projetos/numbering";
import type { FiltrosFolha } from "@/modules/financeiro/folha/status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TODOS = "__todos";
const PADRAO = "__padrao";

const STATUS_OPCOES = [
  { value: PADRAO, label: "A pagar e pagos" },
  { value: "pendente", label: "A pagar" },
  { value: "pago", label: "Pago" },
  { value: "cancelado", label: "Cancelado" },
  { value: "todos", label: "Todos" },
];

/**
 * Busca + filtros da aba Pagamentos, todos na URL (o servidor filtra e pagina).
 * Rótulo ACIMA de cada select, valor dentro — mesmo arranjo de `acessos-filtros`.
 */
export function FolhaFiltros({
  filtros,
  projetistas,
  projetos,
  canceladosOcultos,
}: {
  filtros: FiltrosFolha;
  projetistas: { id: string; name: string }[];
  projetos: { id: string; codigo: string; nome: string }[];
  canceladosOcultos: number;
}) {
  const setParams = useSetParams();
  const [busca, setBusca] = useState(filtros.q);

  // Debounce; `replace` para o Voltar não desfazer a busca letra por letra.
  useEffect(() => {
    if (busca === filtros.q) return;
    const t = setTimeout(() => setParams({ q: busca || null }, { replace: true }), 400);
    return () => clearTimeout(t);
  }, [busca, filtros.q, setParams]);

  const temFiltro = Boolean(
    filtros.status || filtros.projetistaId || filtros.projetoId || filtros.de || filtros.ate || filtros.q,
  );

  function limpar() {
    setBusca("");
    setParams({ status: null, projetistaId: null, projetoId: null, de: null, ate: null, q: null });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ q: busca || null });
          }}
          className="relative min-w-56 flex-1"
          role="search"
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar projetista, disciplina ou projeto..."
            aria-label="Buscar pagamentos"
            className="pl-9"
          />
        </form>
        {temFiltro && (
          <Button variant="outline" size="sm" onClick={limpar}>
            <X className="size-4" aria-hidden />
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="filtro-status">Status</Label>
          <Select
            value={filtros.status ?? PADRAO}
            onValueChange={(v) => v && setParams({ status: v === PADRAO ? null : v })}
          >
            <SelectTrigger id="filtro-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPCOES.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filtro-projetista">Projetista</Label>
          <Select
            value={filtros.projetistaId || TODOS}
            onValueChange={(v) => v && setParams({ projetistaId: v === TODOS ? null : v })}
          >
            <SelectTrigger id="filtro-projetista" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {projetistas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filtro-projeto">Projeto</Label>
          <Select
            value={filtros.projetoId || TODOS}
            onValueChange={(v) => v && setParams({ projetoId: v === TODOS ? null : v })}
          >
            <SelectTrigger id="filtro-projeto" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {projetos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {formatarCodigo(p.codigo)} · {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filtro-de">Liberado de</Label>
          <Input
            id="filtro-de"
            type="date"
            value={filtros.de}
            max={filtros.ate || undefined}
            onChange={(e) => setParams({ de: e.target.value || null })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filtro-ate">Liberado até</Label>
          <Input
            id="filtro-ate"
            type="date"
            value={filtros.ate}
            min={filtros.de || undefined}
            onChange={(e) => setParams({ ate: e.target.value || null })}
          />
        </div>
      </div>

      {filtros.status === null && canceladosOcultos > 0 && (
        <p className="text-xs text-muted-foreground">
          {canceladosOcultos === 1 ? "1 pagamento cancelado oculto" : `${canceladosOcultos} pagamentos cancelados ocultos`}
          {" · "}
          <button
            type="button"
            className="font-medium text-foreground underline-offset-2 hover:underline"
            onClick={() => setParams({ status: "todos" })}
          >
            mostrar
          </button>
        </p>
      )}
    </div>
  );
}
