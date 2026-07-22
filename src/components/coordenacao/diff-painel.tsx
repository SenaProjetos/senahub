"use client";

import { useEffect, useState } from "react";
import { GitCompare, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import type { ViewerEngine } from "@/modules/coordenacao/viewer/engine";
import type { VersaoConvertida } from "@/modules/coordenacao/queries";
import { buscarVersoesConvertidas } from "@/modules/coordenacao/actions";
import { formatarMetros } from "@/modules/coordenacao/medicao";
import { formatarDataHora, rotuloRevisao } from "@/lib/utils";
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

export type ModeloDiff = { uploadId: string; label: string };

type ResultadoDiffLocal = {
  adicionados: string[];
  removidos: string[];
  movidos: { guid: string; delta: number }[];
  inalterados: number;
};

/**
 * Compara duas versões do mesmo modelo (IFC) por IfcGuid: adicionados/removidos/
 * movidos (centro do bbox deslocou > tolerância). Carrega as 2 versões sob demanda
 * (client fragments API — `engine.rodarDiff` cuida disso), coloriza a cena (verde/
 * âmbar/vermelho) e permite focar cada item no 3D.
 */
export function DiffPainel({ engine, modelos }: { engine: ViewerEngine | null; modelos: ModeloDiff[] }) {
  const [modeloNovoId, setModeloNovoId] = useState<string | null>(null);
  const [versoesDisponiveis, setVersoesDisponiveis] = useState<VersaoConvertida[]>([]);
  const [modeloAntigoId, setModeloAntigoId] = useState<string | null>(null);
  const [carregandoVersoes, setCarregandoVersoes] = useState(false);
  const [comparando, setComparando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDiffLocal | null>(null);
  const [diffAtivo, setDiffAtivo] = useState<{ antigo: string; novo: string } | null>(null);

  useEffect(() => {
    if (!modeloNovoId) {
      setVersoesDisponiveis([]);
      setModeloAntigoId(null);
      return;
    }
    setCarregandoVersoes(true);
    setModeloAntigoId(null);
    void buscarVersoesConvertidas(modeloNovoId)
      .then((vs) => setVersoesDisponiveis(vs.filter((v) => v.uploadId !== modeloNovoId)))
      .finally(() => setCarregandoVersoes(false));
  }, [modeloNovoId]);

  const nomeDe = (uploadId: string) => modelos.find((m) => m.uploadId === uploadId)?.label ?? "—";

  async function comparar() {
    if (!engine || !modeloNovoId || !modeloAntigoId) return;
    setComparando(true);
    try {
      const r = await engine.rodarDiff(modeloAntigoId, modeloNovoId);
      setResultado(r);
      setDiffAtivo({ antigo: modeloAntigoId, novo: modeloNovoId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao comparar as versões.");
    } finally {
      setComparando(false);
    }
  }

  async function sair() {
    if (engine && diffAtivo) await engine.sairDiff(diffAtivo.antigo, diffAtivo.novo);
    setResultado(null);
    setDiffAtivo(null);
  }

  function focar(modeloId: string, guid: string) {
    void engine?.focarGuid(modeloId, guid);
  }

  if (modelos.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <GitCompare className="size-4" /> Comparar versões
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!resultado ? (
          <>
            <div className="space-y-2">
              <Select value={modeloNovoId ?? ""} onValueChange={(v) => setModeloNovoId(v || null)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Versão nova" />
                </SelectTrigger>
                <SelectContent>
                  {modelos.map((m) => (
                    <SelectItem key={m.uploadId} value={m.uploadId}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={modeloAntigoId ?? ""}
                onValueChange={(v) => setModeloAntigoId(v || null)}
                disabled={!modeloNovoId || carregandoVersoes}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={carregandoVersoes ? "Carregando…" : "Versão antiga"} />
                </SelectTrigger>
                <SelectContent>
                  {versoesDisponiveis.map((v) => (
                    <SelectItem key={v.uploadId} value={v.uploadId}>
                      {rotuloRevisao(v.versao)} — {formatarDataHora(v.createdAt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={!modeloNovoId || !modeloAntigoId || comparando}
              onClick={comparar}
            >
              {comparando ? "Comparando…" : "Comparar"}
            </Button>
            {modeloNovoId && !carregandoVersoes && versoesDisponiveis.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma outra versão convertida deste modelo.</p>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Badge className="bg-status-aprovado text-white">{resultado.adicionados.length} adicionados</Badge>
              <Badge variant="destructive">{resultado.removidos.length} removidos</Badge>
              <Badge className="bg-warning text-warning-foreground">{resultado.movidos.length} movidos</Badge>
              <Badge variant="outline">{resultado.inalterados} inalterados</Badge>
            </div>
            <ScrollArea className="max-h-[35vh]">
              <div className="space-y-2 pr-3 text-xs">
                {resultado.adicionados.length > 0 && (
                  <div>
                    <p className="font-medium text-status-aprovado">Adicionados</p>
                    {resultado.adicionados.map((guid) => (
                      <button
                        key={guid}
                        type="button"
                        className="flex w-full items-center gap-1.5 truncate rounded px-1.5 py-1 text-left hover:bg-muted/50"
                        onClick={() => diffAtivo && focar(diffAtivo.novo, guid)}
                      >
                        <MapPin className="size-3 shrink-0" />
                        <span className="truncate font-mono">{guid}</span>
                      </button>
                    ))}
                  </div>
                )}
                {resultado.movidos.length > 0 && (
                  <div>
                    <p className="font-medium text-warning">Movidos</p>
                    {resultado.movidos.map(({ guid, delta }) => (
                      <button
                        key={guid}
                        type="button"
                        className="flex w-full items-center gap-1.5 truncate rounded px-1.5 py-1 text-left hover:bg-muted/50"
                        onClick={() => diffAtivo && focar(diffAtivo.novo, guid)}
                      >
                        <MapPin className="size-3 shrink-0" />
                        <span className="truncate font-mono">{guid}</span>
                        <span className="ml-auto shrink-0 text-muted-foreground">{formatarMetros(delta)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {resultado.removidos.length > 0 && (
                  <div>
                    <p className="font-medium text-destructive">Removidos</p>
                    {resultado.removidos.map((guid) => (
                      <button
                        key={guid}
                        type="button"
                        className="flex w-full items-center gap-1.5 truncate rounded px-1.5 py-1 text-left hover:bg-muted/50"
                        onClick={() => diffAtivo && focar(diffAtivo.antigo, guid)}
                      >
                        <MapPin className="size-3 shrink-0" />
                        <span className="truncate font-mono">{guid}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
            <p className="text-[11px] text-muted-foreground">
              Comparando {nomeDe(diffAtivo?.antigo ?? "")} → {nomeDe(diffAtivo?.novo ?? "")}
            </p>
            <Button size="sm" variant="ghost" className="w-full" onClick={() => void sair()}>
              <X className="mr-1.5 size-3.5" /> Sair do diff
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
