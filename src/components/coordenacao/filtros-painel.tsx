"use client";

import { useState, useMemo } from "react";
import { Filter } from "lucide-react";
import type { ViewerEngine } from "@/modules/coordenacao/viewer/engine";
import type { ElementoIndex } from "@/modules/coordenacao/indice-elementos";
import { pavimentosDistintos, categoriasDistintas } from "@/modules/coordenacao/indice-elementos";
import { aplicarFiltro, localIdsVisiveis } from "@/modules/coordenacao/filtros";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

export function FiltrosPanel({
  engine,
  modeloId,
  elementos,
}: {
  engine: ViewerEngine | null;
  modeloId: string;
  elementos: ElementoIndex[];
}) {
  const [pavimentosSelecionados, setPavimentosSelecionados] = useState<Set<number | null>>(new Set());
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<Set<string>>(new Set());

  const pavimentos = useMemo(() => pavimentosDistintos(elementos), [elementos]);
  const categorias = useMemo(() => categoriasDistintas(elementos), [elementos]);
  const porPavimento = useMemo(() => {
    const m = new Map<number | null, ElementoIndex[]>();
    for (const el of elementos) {
      const p = m.get(el.pavimentoLocalId) ?? [];
      p.push(el);
      m.set(el.pavimentoLocalId, p);
    }
    return m;
  }, [elementos]);

  const filtro = useMemo(
    () => ({
      pavimentos: pavimentosSelecionados.size > 0 ? [...pavimentosSelecionados] : undefined,
      categorias: categoriasSelecionadas.size > 0 ? [...categoriasSelecionadas] : undefined,
    }),
    [pavimentosSelecionados, categoriasSelecionadas],
  );

  const elementosFiltrados = useMemo(() => aplicarFiltro(elementos, filtro), [elementos, filtro]);
  const localIds = useMemo(() => localIdsVisiveis(elementos, filtro), [elementos, filtro]);

  // Aplica isolamento em tempo real.
  function atualizarVisibilidade() {
    if (engine && localIds.length > 0) {
      void engine.isolarElementos(modeloId, localIds);
    } else if (engine) {
      void engine.mostrarTudo();
    }
  }

  function alternarPavimento(pavId: number | null) {
    setPavimentosSelecionados((s) => {
      const n = new Set(s);
      if (n.has(pavId)) n.delete(pavId);
      else n.add(pavId);
      return n;
    });
  }

  function alternarCategoria(cat: string) {
    setCategoriasSelecionadas((s) => {
      const n = new Set(s);
      if (n.has(cat)) n.delete(cat);
      else n.add(cat);
      return n;
    });
  }

  function limpar() {
    setPavimentosSelecionados(new Set());
    setCategoriasSelecionadas(new Set());
  }

  // Aplica sempre que filtro muda.
  if (filtro.pavimentos || filtro.categorias) atualizarVisibilidade();
  else if (engine) void engine.mostrarTudo();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Filter className="size-4" /> Filtros
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[40vh]">
          <div className="space-y-3 pr-3">
            {/* Pavimentos */}
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Pavimentos</p>
              <div className="space-y-1 pt-1">
                {pavimentos.map((pav) => {
                  const nomePav = pav.nome ?? "Sem pavimento";
                  const selecionado = pavimentosSelecionados.has(pav.localId);
                  const elesPav = porPavimento.get(pav.localId) ?? [];
                  return (
                    <div key={String(pav.localId)}>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`pav-${pav.localId}`}
                          checked={selecionado}
                          onCheckedChange={() => alternarPavimento(pav.localId)}
                        />
                        <Label htmlFor={`pav-${pav.localId}`} className="flex flex-1 items-center gap-2 cursor-pointer text-xs">
                          <span className="truncate">{nomePav}</span>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {elesPav.length}
                          </Badge>
                        </Label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Categorias */}
            <div className="pt-2 border-t">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Categorias</p>
              <div className="space-y-1 pt-1">
                {categorias.map((cat) => {
                  const selecionada = categoriasSelecionadas.has(cat);
                  const elesCat = elementos.filter((e) => e.category === cat);
                  return (
                    <div key={cat}>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`cat-${cat}`}
                          checked={selecionada}
                          onCheckedChange={() => alternarCategoria(cat)}
                        />
                        <Label htmlFor={`cat-${cat}`} className="flex flex-1 items-center gap-2 cursor-pointer text-xs">
                          <span className="truncate text-muted-foreground">{cat}</span>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {elesCat.length}
                          </Badge>
                        </Label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Resultado + Limpar */}
            {(pavimentosSelecionados.size > 0 || categoriasSelecionadas.size > 0) && (
              <div className="space-y-2 border-t pt-2">
                <p className="text-xs text-muted-foreground">
                  {elementosFiltrados.length} de {elementos.length} elemento(s) visível(is)
                </p>
                <Button size="sm" variant="outline" onClick={limpar} className="w-full">
                  Limpar filtros
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
