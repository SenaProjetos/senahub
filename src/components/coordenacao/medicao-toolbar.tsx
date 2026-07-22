"use client";

import { useState, useEffect } from "react";
import { Ruler, XCircle, RotateCcw } from "lucide-react";
import type { ViewerEngine, TipoMedicao, ResultadoMedicaoView } from "@/modules/coordenacao/viewer/engine";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Barra flutuante de medição: inicia/para modo, mostra progresso e resultado.
 * Self-contained — recebe engine, gerencia estado local de UI.
 */
export function MedicaoToolbar({ engine }: { engine: ViewerEngine | null }) {
  const [estado, setEstado] = useState<ResultadoMedicaoView | null>(null);

  useEffect(() => {
    if (!engine?.medindo) setEstado(null);
  }, [engine?.medindo]);

  function iniciar(tipo: TipoMedicao) {
    engine?.iniciarMedicao(tipo, setEstado);
  }

  function parar() {
    engine?.sairMedicao();
    setEstado(null);
  }

  function reiniciar() {
    engine?.reiniciarMedicao();
  }

  if (!engine?.medindo) {
    return (
      <Card className="absolute bottom-4 left-4 w-60">
        <CardContent className="space-y-2 pt-4">
          <p className="text-xs font-medium text-muted-foreground">Clique pontos na malha para medir</p>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={() => iniciar("distancia")}>
              Distância
            </Button>
            <Button size="sm" variant="outline" onClick={() => iniciar("angulo")}>
              Ângulo
            </Button>
            <Button size="sm" variant="outline" onClick={() => iniciar("area")}>
              Área
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="absolute bottom-4 left-4 w-72 border-primary/50 bg-primary/5">
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ruler className="size-4 text-primary" />
            <span className="text-sm font-medium capitalize">{estado?.tipo || "—"}</span>
            <Badge variant="secondary" className="text-xs">
              {estado?.pontos ?? 0} pt
            </Badge>
          </div>
          <Button size="icon" variant="ghost" className="size-7" onClick={parar} title="Encerrar medição">
            <XCircle className="size-4" />
          </Button>
        </div>

        {estado?.rotulo && (
          <div className="rounded bg-primary/10 px-2.5 py-1.5">
            <p className="font-mono text-sm font-semibold text-primary">{estado.rotulo}</p>
          </div>
        )}

        <div className="flex gap-2">
          {estado?.tipo === "area" && estado.pontos >= 3 && (
            <Button
              size="sm"
              variant="default"
              onClick={() => engine?.finalizarArea()}
              disabled={estado.completo}
              className="flex-1"
            >
              Finalizar
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={reiniciar} className="flex-1">
            <RotateCcw className="mr-1 size-3" /> Reiniciar
          </Button>
        </div>

        {!estado?.completo && (
          <p className="text-xs text-muted-foreground">
            {estado?.tipo === "distancia" && `Clique 2 pontos (${estado?.pontos ?? 0}/2)`}
            {estado?.tipo === "angulo" && `Clique 3 pontos (${estado?.pontos ?? 0}/3)`}
            {estado?.tipo === "area" && `Clique 3+ pontos (${estado?.pontos ?? 0}, finalize quando pronto)`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
