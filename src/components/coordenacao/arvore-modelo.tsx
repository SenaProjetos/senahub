"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ListTree, Eye, X } from "lucide-react";
import type { ViewerEngine } from "@/modules/coordenacao/viewer/engine";
import {
  agruparPorCategoria,
  agruparPorPavimento,
  pavimentosDistintos,
  type ElementoIndex,
} from "@/modules/coordenacao/indice-elementos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ModeloCarregado = { uploadId: string; label: string };

const PAVIMENTO_SEM_NOME = "Sem pavimento";

/**
 * Árvore de navegação do modelo: Pavimento → Categoria (IfcClass), com contagem.
 * Clicar numa categoria isola só aqueles elementos na cena (via ViewerEngine);
 * "Mostrar tudo" reverte. Busca o índice sob demanda (client fragments API, Onda 0
 * — ver docs/superpowers/plans/2026-07-21-compatibilizacao-ferramentas.md).
 */
export function ArvoreModelo({
  engine,
  modelos,
}: {
  engine: ViewerEngine | null;
  modelos: ModeloCarregado[];
}) {
  const [modeloId, setModeloId] = useState<string | null>(null);
  const [elementos, setElementos] = useState<ElementoIndex[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<number | null>>(new Set());
  const [isolado, setIsolado] = useState<{ pavimento: number | null; categoria: string } | null>(null);

  // Modelo ativo padrão: o primeiro carregado. Se o modelo escolhido descarregar, troca.
  useEffect(() => {
    if (modeloId && modelos.some((m) => m.uploadId === modeloId)) return;
    setModeloId(modelos[0]?.uploadId ?? null);
  }, [modelos, modeloId]);

  useEffect(() => {
    if (!engine || !modeloId) {
      setElementos([]);
      return;
    }
    setCarregando(true);
    setIsolado(null);
    void engine
      .indiceDoModelo(modeloId)
      .then(setElementos)
      .finally(() => setCarregando(false));
  }, [engine, modeloId]);

  const pavimentos = useMemo(() => pavimentosDistintos(elementos), [elementos]);
  const porPavimento = useMemo(() => agruparPorPavimento(elementos), [elementos]);

  function alternarExpandido(pavimentoId: number | null) {
    setExpandidos((s) => {
      const n = new Set(s);
      if (n.has(pavimentoId)) n.delete(pavimentoId);
      else n.add(pavimentoId);
      return n;
    });
  }

  function isolarCategoria(pavimentoId: number | null, categoria: string, els: ElementoIndex[]) {
    if (!engine || !modeloId) return;
    const ids = els.filter((e) => e.category === categoria).map((e) => e.localId);
    setIsolado({ pavimento: pavimentoId, categoria });
    void engine.isolarElementos(modeloId, ids);
  }

  function limparIsolamento() {
    if (!engine) return;
    setIsolado(null);
    void engine.mostrarTudo();
  }

  if (modelos.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <ListTree className="size-4" /> Elementos
        </CardTitle>
        <div className="flex items-center gap-2 pt-1">
          <Select value={modeloId ?? ""} onValueChange={(v) => setModeloId(v || null)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Escolha um modelo" />
            </SelectTrigger>
            <SelectContent>
              {modelos.map((m) => (
                <SelectItem key={m.uploadId} value={m.uploadId}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isolado && (
            <Button size="icon" variant="ghost" className="size-8 shrink-0" title="Mostrar tudo" onClick={limparIsolamento}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <p className="py-2 text-xs text-muted-foreground">Carregando elementos…</p>
        ) : elementos.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">Nenhum elemento indexado.</p>
        ) : (
          <ScrollArea className="max-h-[40vh]">
            <div className="space-y-1 pr-3">
              {pavimentos.map((pav) => {
                const els = porPavimento.get(pav.localId) ?? [];
                const categorias = agruparPorCategoria(els);
                const nomePav = pav.nome ?? PAVIMENTO_SEM_NOME;
                const aberto = expandidos.has(pav.localId);
                return (
                  <div key={String(pav.localId)}>
                    <button
                      type="button"
                      onClick={() => alternarExpandido(pav.localId)}
                      className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-xs font-medium hover:bg-muted/50"
                      aria-expanded={aberto}
                    >
                      <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", !aberto && "-rotate-90")} />
                      <span className="truncate">{nomePav}</span>
                      <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                        {els.length}
                      </Badge>
                    </button>
                    {aberto && (
                      <div className="ml-5 space-y-0.5 border-l pl-2">
                        {[...categorias.entries()].map(([categoria, itens]) => {
                          const ativo = isolado?.pavimento === pav.localId && isolado?.categoria === categoria;
                          return (
                            <button
                              key={categoria}
                              type="button"
                              onClick={() => isolarCategoria(pav.localId, categoria, els)}
                              className={cn(
                                "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-muted/50",
                                ativo && "bg-muted",
                              )}
                              title={`Isolar ${itens.length} elemento(s) de ${categoria}`}
                            >
                              {ativo && <Eye className="size-3 shrink-0 text-primary" />}
                              <span className="truncate text-muted-foreground">{categoria}</span>
                              <span className="ml-auto shrink-0 text-muted-foreground">{itens.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
