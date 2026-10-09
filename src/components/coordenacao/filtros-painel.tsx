"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Filter } from "lucide-react";
import type { ViewerEngine } from "@/modules/coordenacao/viewer/engine";
import { categoriasDistintas } from "@/modules/coordenacao/indice-elementos";
import {
  aplicarFiltroMulti,
  buscarPsets,
  filtroMultiVazio,
  localIdsPorModelo,
  pavimentosUnificados,
  psetsDistintos,
  type ElementoDeModelo,
  type FiltroMultiModelo,
} from "@/modules/coordenacao/filtros";
import { rotuloCategoria } from "@/modules/coordenacao/conflitos-lista";
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

/**
 * Filtros de TODOS os modelos carregados: pavimento (unido pelo nome entre as
 * disciplinas e ordenado pela cota), categoria IFC e Property Sets. Marcar "TÉRREO"
 * isola o térreo do ARQ, do EST e das instalações juntos — é o uso da compatibilização.
 */
export function FiltrosPanel({
  engine,
  modelos,
  onFiltroAtivoChange,
}: {
  engine: ViewerEngine | null;
  modelos: { uploadId: string; label: string }[];
  onFiltroAtivoChange?: (ativo: boolean) => void;
}) {
  const [elementos, setElementos] = useState<ElementoDeModelo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [carregandoPsets, setCarregandoPsets] = useState(false);
  const [pavimentosSelecionados, setPavimentosSelecionados] = useState<Set<string>>(new Set());
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<Set<string>>(new Set());
  const [psetsSelecionados, setPsetsSelecionados] = useState<Set<string>>(new Set());
  const [buscaPset, setBuscaPset] = useState("");
  const filtroEraAtivo = useRef(false);

  const modeloIds = useMemo(() => modelos.map((m) => m.uploadId), [modelos]);
  const chaveModelos = modeloIds.join("|");

  // Índice de cada modelo (o engine guarda em cache); Psets em seguida, sob demanda.
  useEffect(() => {
    if (!engine || modeloIds.length === 0) {
      setElementos([]);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setCarregandoPsets(false);
    void (async () => {
      try {
        const bases = await Promise.all(modeloIds.map((id) => engine.indiceDoModelo(id)));
        if (cancelado) return;
        setElementos(bases.flatMap((lista, i) => lista.map((e) => ({ ...e, modeloId: modeloIds[i] }))));
        setCarregando(false);
        setCarregandoPsets(true);
        const enriquecidos: ElementoDeModelo[] = [];
        for (const [i, id] of modeloIds.entries()) {
          const lista = await engine.indiceComPsetsDoModelo(id);
          if (cancelado) return;
          enriquecidos.push(...lista.map((e) => ({ ...e, modeloId: modeloIds[i] })));
        }
        if (!cancelado) setElementos(enriquecidos);
      } finally {
        if (!cancelado) {
          setCarregando(false);
          setCarregandoPsets(false);
        }
      }
    })();
    return () => {
      cancelado = true;
    };
    // chaveModelos resume modeloIds (array novo a cada render do pai).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, chaveModelos]);

  const pavimentos = useMemo(() => pavimentosUnificados(elementos), [elementos]);
  const categorias = useMemo(() => categoriasDistintas(elementos), [elementos]);
  const contagemCategoria = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of elementos) m.set(e.category, (m.get(e.category) ?? 0) + 1);
    return m;
  }, [elementos]);
  const opcoesPset = useMemo(() => psetsDistintos(elementos), [elementos]);
  const psetsParciais = useMemo(() => elementos.some((elemento) => elemento.propriedadesParciais), [elementos]);
  const resultadoBuscaPset = useMemo(
    () => buscarPsets(opcoesPset, buscaPset, LIMITE_PSETS_RENDERIZADOS),
    [buscaPset, opcoesPset],
  );

  const filtro = useMemo<FiltroMultiModelo>(
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

  const totalFiltrado = useMemo(() => aplicarFiltroMulti(elementos, filtro).length, [elementos, filtro]);
  const visiveisPorModelo = useMemo(
    () => localIdsPorModelo(elementos, filtro, modeloIds),
    [elementos, filtro, modeloIds],
  );
  const temFiltro = !filtroMultiVazio(filtro);

  // Aplica isolamento em tempo real depois do render (inclusive resultado vazio).
  useEffect(() => {
    if (!engine) return;
    if (temFiltro) void engine.isolarPorModelo(visiveisPorModelo);
    else if (filtroEraAtivo.current) void engine.mostrarTudo();
    filtroEraAtivo.current = temFiltro;
  }, [engine, visiveisPorModelo, temFiltro]);

  useEffect(() => {
    onFiltroAtivoChange?.(temFiltro);
  }, [onFiltroAtivoChange, temFiltro]);

  // Fechar o painel nunca deixa o viewer preso num isolamento invisível.
  useEffect(() => {
    const engineAtual = engine;
    return () => {
      if (engineAtual) void engineAtual.mostrarTudo();
    };
  }, [engine]);

  function alternar<T>(setter: (fn: (s: Set<T>) => Set<T>) => void, valor: T) {
    setter((s) => {
      const n = new Set(s);
      if (n.has(valor)) n.delete(valor);
      else n.add(valor);
      return n;
    });
  }

  function limpar() {
    setPavimentosSelecionados(new Set());
    setCategoriasSelecionadas(new Set());
    setPsetsSelecionados(new Set());
  }

  if (modelos.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Filter className="size-4" /> Filtros
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          {modelos.length > 1
            ? `Valem para os ${modelos.length} modelos carregados; pavimentos com o mesmo nome são o mesmo andar.`
            : "Valem para o modelo carregado."}
        </p>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <p className="py-2 text-xs text-muted-foreground">Carregando elementos…</p>
        ) : (
          <ScrollArea className="max-h-[40vh]">
            <div className="relative space-y-3 pr-3">
              {/* Pavimentos */}
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Pavimentos</p>
                <div className="space-y-1 pt-1">
                  {pavimentos.map((pav) => {
                    const id = `pav-${encodeURIComponent(pav.chave)}`;
                    const parcial = modelos.length > 1 && pav.modelos < modelos.length;
                    return (
                      <div key={pav.chave} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={pavimentosSelecionados.has(pav.chave)}
                          onCheckedChange={() => alternar(setPavimentosSelecionados, pav.chave)}
                        />
                        <Label htmlFor={id} className="flex flex-1 cursor-pointer items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate">{pav.nome ?? "Sem pavimento"}</span>
                          {parcial && (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {pav.modelos} de {modelos.length} modelos
                            </span>
                          )}
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {pav.total}
                          </Badge>
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Categorias */}
              <div className="border-t pt-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Categorias</p>
                <div className="space-y-1 pt-1">
                  {categorias.map((cat) => {
                    const id = `cat-${cat}`;
                    return (
                      <div key={cat} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={categoriasSelecionadas.has(cat)}
                          onCheckedChange={() => alternar(setCategoriasSelecionadas, cat)}
                        />
                        <Label htmlFor={id} className="flex flex-1 cursor-pointer items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate" title={cat}>
                            {rotuloCategoria(cat)}
                          </span>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {contagemCategoria.get(cat) ?? 0}
                          </Badge>
                        </Label>
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
                  <p className="pt-1 text-xs text-muted-foreground">Os modelos não expuseram Property Sets filtráveis.</p>
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
                            onCheckedChange={() => alternar(setPsetsSelecionados, chave)}
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
                    {totalFiltrado} de {elementos.length} elemento(s) visível(is)
                  </p>
                  <Button size="sm" variant="outline" onClick={limpar} className="w-full">
                    Limpar filtros
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
