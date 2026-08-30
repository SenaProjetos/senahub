"use client";

import { useEffect, useState } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { useSetParams } from "@/lib/use-set-param";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_CREDENCIAL } from "@/modules/acessos/service";
import { STATUS_LABEL, NIVEL_ACESSO_LABEL } from "@/modules/acessos/labels";
import { UFS } from "@/modules/acessos/schemas";

export type FiltrosAtuais = {
  q: string;
  categoriaId: string;
  estado: string;
  responsavelId: string;
  nivelAcesso: string;
  status: string;
  favoritos: boolean;
};

/**
 * Busca (§9) + filtros (§10).
 *
 * Cada select tem o RÓTULO ACIMA e o valor dentro, em vez de "Categoria: todos" comprimido no
 * gatilho: com cinco filtros lado a lado, ler o rótulo separado do valor é o que permite varrer
 * a linha inteira de relance e ver o que está aplicado.
 */
export function AcessosFiltros({
  filtros,
  categorias,
  responsaveis,
  avancadosAbertos,
  onAlternarAvancados,
}: {
  filtros: FiltrosAtuais;
  categorias: Array<{ id: string; nome: string }>;
  responsaveis: Array<{ id: string; name: string }>;
  avancadosAbertos: boolean;
  onAlternarAvancados: () => void;
}) {
  const setParams = useSetParams();
  const [busca, setBusca] = useState(filtros.q);

  // Debounce (§9). `replace` para o Voltar do navegador não desfazer a busca letra por letra;
  // a guarda contra `filtros.q` impede o laço depois que a navegação devolve o valor novo.
  useEffect(() => {
    if (busca === filtros.q) return;
    const t = setTimeout(() => setParams({ q: busca || null }, { replace: true }), 400);
    return () => clearTimeout(t);
  }, [busca, filtros.q, setParams]);

  const temFiltro =
    Boolean(
      filtros.q ||
        filtros.categoriaId ||
        filtros.estado ||
        filtros.responsavelId ||
        filtros.nivelAcesso ||
        filtros.status,
    ) || filtros.favoritos;

  function limpar() {
    setBusca("");
    setParams({
      q: null,
      categoriaId: null,
      estado: null,
      responsavelId: null,
      nivelAcesso: null,
      status: null,
      favoritos: null,
    });
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
            placeholder="Buscar conta, órgão, estado ou software..."
            aria-label="Buscar acessos"
            className="pl-9"
          />
        </form>

        {temFiltro && (
          <Button variant="outline" size="sm" onClick={limpar}>
            <X className="size-4" aria-hidden />
            Limpar filtros
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onAlternarAvancados}
          aria-expanded={avancadosAbertos}
          aria-controls="filtros-avancados"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filtros avançados
        </Button>
      </div>

      <div
        id="filtros-avancados"
        hidden={!avancadosAbertos}
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
      >
        <CampoFiltro
          rotulo="Categoria"
          valor={filtros.categoriaId}
          onChange={(v) => setParams({ categoriaId: v })}
          opcoes={categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))}
        />
        <CampoFiltro
          rotulo="Estado"
          valor={filtros.estado}
          onChange={(v) => setParams({ estado: v })}
          opcoes={[
            { valor: "NACIONAL", rotulo: "Nacional" },
            { valor: "NA", rotulo: "Não aplicável" },
            ...UFS.map((uf) => ({ valor: uf, rotulo: uf })),
          ]}
        />
        <CampoFiltro
          rotulo="Responsável"
          valor={filtros.responsavelId}
          onChange={(v) => setParams({ responsavelId: v })}
          opcoes={responsaveis.map((r) => ({ valor: r.id, rotulo: r.name }))}
        />
        <CampoFiltro
          rotulo="Nível de acesso"
          valor={filtros.nivelAcesso}
          onChange={(v) => setParams({ nivelAcesso: v })}
          opcoes={Object.entries(NIVEL_ACESSO_LABEL).map(([valor, rotulo]) => ({ valor, rotulo }))}
        />
        <CampoFiltro
          rotulo="Status"
          valor={filtros.status}
          onChange={(v) => setParams({ status: v })}
          opcoes={STATUS_CREDENCIAL.map((s) => ({ valor: s, rotulo: STATUS_LABEL[s] }))}
        />
      </div>
    </div>
  );
}

/** Rótulo em cima, valor dentro. "Todos" é opção real, e limpa o parâmetro da URL. */
function CampoFiltro({
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
        value={valor || "__todos"}
        // base-ui entrega `string | null`, diferente do Radix — gotcha do CLAUDE.md.
        onValueChange={(v) => onChange(!v || v === "__todos" ? null : v)}
      >
        <SelectTrigger className="h-9 w-full" aria-label={rotulo}>
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__todos">Todos</SelectItem>
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
