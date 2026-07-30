"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Filter } from "lucide-react";
import type { ViewerEngine } from "@/modules/coordenacao/viewer/engine";
import type { ElementoIndex } from "@/modules/coordenacao/indice-elementos";
import { pavimentosDistintos, categoriasDistintas } from "@/modules/coordenacao/indice-elementos";
import {
  aplicarFiltro,
  buscarPsets,
  filtroVazio,
  localIdsVisiveis,
  psetsDistintos,
} from "@/modules/coordenacao/filtros";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

const LIMITE_PSETS_RENDERIZADOS = 200;

function chavePset(pset: { pset: string; nome: string; valor: string }) {
  return JSON.stringify([pset.pset, pset.nome, pset.valor]);
}

export function FiltrosPanel({
  engine,
  modeloId,
  elementos,
  carregandoPsets = false,
  onFiltroAtivoChange,
}: {
  engine: ViewerEngine | null;
  modeloId: string;
  elementos: ElementoIndex[];
  carregandoPsets?: boolean;
  onFiltroAtivoChange?: (ativo: boolean) => void;
}) {
  const [pavimentosSelecionados, setPavimentosSelecionados] = useState<Set<number | null>>(new Set());
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<Set<string>>(new Set());
  const [psetsSelecionados, setPsetsSelecionados] = useState<Set<string>>(new Set());
  const [buscaPset, setBuscaPset] = useState("");
  const filtroEraAtivo = useRef(false);

  const pavimentos = useMemo(() => pavimentosDistintos(elementos), [elementos]);
  const categorias = useMemo(() => categoriasDistintas(elementos), [elementos]);
  const opcoesPset = useMemo(() => psetsDistintos(elementos), [elementos]);
  const psetsParciais = useMemo(
    () => elementos.some((elemento) => elemento.propriedadesParciais),
    [elementos],
  );
  const resultadoBuscaPset = useMemo(
    () => buscarPsets(opcoesPset, buscaPset, LIMITE_PSETS_RENDERIZADOS),
    [buscaPset, opcoesPset],
  );
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
      psets:
        psetsSelecionados.size > 0
          ? opcoesPset.filter((opcao) => psetsSelecionados.has(chavePset(opcao)))
          : undefined,
    }),
    [pavimentosSelecionados, categoriasSelecionadas, psetsSelecionados, opcoesPset],
  );

  const elementosFiltrados = useMemo(() => aplicarFiltro(elementos, filtro), [elementos, filtro]);
  const localIds = useMemo(() => localIdsVisiveis(elementos, filtro), [elementos, filtro]);

  const temFiltro = !filtroVazio(filtro);

  // Aplica isolamento em tempo real depois do render (inclusive resultado vazio).
  useEffect(() => {
    if (!engine) return;
    if (temFiltro) void engine.isolarElementos(modeloId, localIds);
    else if (filtroEraAtivo.current) void engine.mostrarTudo();
    filtroEraAtivo.current = temFiltro;
  }, [engine, localIds, modeloId, temFiltro]);

  useEffect(() => {
    onFiltroAtivoChange?.(temFiltro);
  }, [onFiltroAtivoChange, temFiltro]);

  // Fechar/trocar o painel nunca deixa o viewer preso num isolamento invisível.
  useEffect(() => {
    const engineAtual = engine;
    return () => {
      if (engineAtual) void engineAtual.mostrarTudo();
    };
  }, [engine, modeloId]);

  useEffect(() => {
    setPavimentosSelecionados(new Set());
    setCategoriasSelecionadas(new Set());
    setPsetsSelecionados(new Set());
    setBuscaPset("");
  }, [modeloId]);

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

  function alternarPset(chave: string) {
    setPsetsSelecionados((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  }

  function limpar() {
    setPavimentosSelecionados(new Set());
    setCategoriasSelecionadas(new Set());
    setPsetsSelecionados(new Set());
  }

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

            {/* Property Sets IFC */}
            <div className="border-t pt-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Propriedades IFC (Pset)</p>
              {carregandoPsets ? (
                <p className="pt-1 text-xs text-muted-foreground">Carregando propriedades…</p>
              ) : opcoesPset.length === 0 ? (
                <p className="pt-1 text-xs text-muted-foreground">O modelo não expôs Property Sets filtráveis.</p>
              ) : (
                <div className="space-y-2 pt-1">
                  {psetsParciais && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Modelo muito grande: parte dos Psets foi limitada para preservar memória e responsividade.
                    </p>
                  )}
                  <Input
                    value={buscaPset}
                    onChange={(evento) => setBuscaPset(evento.target.value)}
                    placeholder="Buscar Pset, propriedade ou valor"
                    className="h-8 text-xs"
                    aria-label="Buscar propriedades IFC"
                  />
                  {resultadoBuscaPset.total > LIMITE_PSETS_RENDERIZADOS && (
                    <p className="text-[11px] text-muted-foreground">
                      Exibindo {LIMITE_PSETS_RENDERIZADOS} de {resultadoBuscaPset.total}. Refine a busca para ver outras opções.
                    </p>
                  )}
                  {resultadoBuscaPset.total === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhuma propriedade encontrada.</p>
                  )}
                  {resultadoBuscaPset.itens.map((opcao, indice) => {
                    const chave = chavePset(opcao);
                    const id = `pset-${indice}`;
                    return (
                      <div key={chave} className="flex items-start gap-2">
                        <Checkbox
                          id={id}
                          checked={psetsSelecionados.has(chave)}
                          onCheckedChange={() => alternarPset(chave)}
                        />
                        <Label htmlFor={id} className="min-w-0 cursor-pointer text-xs">
                          <span className="block truncate font-medium">{opcao.pset} · {opcao.nome}</span>
                          <span className="block truncate text-muted-foreground">{opcao.valor}</span>
                        </Label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Resultado + Limpar */}
            {temFiltro && (
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
