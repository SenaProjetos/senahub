"use client";

import { useState } from "react";
import { Eye, Trash2, ChevronDown } from "lucide-react";
import type { ViewerEngine } from "@/modules/coordenacao/viewer/engine";
import type { VistaView } from "@/modules/coordenacao/queries";
import { excluirVistaCoordenacao } from "@/modules/coordenacao/actions";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function VistasPanel({
  engine,
  vistas,
  carregados,
  onToggleModelo,
  onAplicarCorte,
  currentUserId,
}: {
  engine: ViewerEngine | null;
  vistas: VistaView[];
  carregados: Set<string>;
  onToggleModelo: (uploadId: string, ligar: boolean) => void;
  onAplicarCorte: (config: { eixo: "x" | "y" | "z"; posicao: number; invertido: boolean } | null) => void;
  currentUserId: string;
}) {
  const [aberto, setAberto] = useState(true);
  const [, start] = useTransition();

  async function aplicarVista(vista: VistaView) {
    if (!engine) return;
    try {
      // Restaura câmera.
      await engine.restaurarCamera(vista.camera);
      // Religar modelos (desligar todos, religar só os da vista).
      for (const carregadoId of carregados) {
        onToggleModelo(carregadoId, false);
      }
      for (const modeloId of vista.modelosVisiveis) {
        onToggleModelo(modeloId, true);
      }
      // Reaplicar corte.
      onAplicarCorte(vista.corte);
      toast.success(`Vista "${vista.nome}" aplicada.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aplicar vista.");
    }
  }

  function excluir(vista: VistaView) {
    if (currentUserId !== vista.autorId && currentUserId !== "admin") {
      toast.error("Só quem criou a vista pode excluí-la.");
      return;
    }
    start(async () => {
      const r = await excluirVistaCoordenacao({ id: vista.id });
      if (r.ok) {
        toast.success(`Vista "${vista.nome}" excluída.`);
      } else {
        toast.error(r.error || "Erro ao excluir vista.");
      }
    });
  }

  if (vistas.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
          aria-expanded={aberto}
        >
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", !aberto && "-rotate-90")} />
          <CardTitle className="text-sm">
            Vistas salvas
            <span className="ml-2 font-normal text-muted-foreground">({vistas.length})</span>
          </CardTitle>
        </button>
      </CardHeader>
      {aberto && (
        <CardContent>
          <ScrollArea className="max-h-[40vh]">
            <div className="space-y-2 pr-3">
              {vistas.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-2 rounded bg-muted/30 px-2.5 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{v.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">{v.autor}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => aplicarVista(v)}
                      title="Aplicar vista"
                    >
                      <Eye className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => excluir(v)}
                      title="Excluir vista"
                      disabled={currentUserId !== v.autorId}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}
