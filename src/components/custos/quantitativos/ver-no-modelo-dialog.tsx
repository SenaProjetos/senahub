"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import type { ViewerEngine } from "@/modules/coordenacao/viewer/engine";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { buscarGuidsPorItem } from "@/modules/custos/quantitativos/actions";

const Viewer3D = dynamic(() => import("@/components/coordenacao/viewer-3d"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
});

/**
 * Destaca no viewer 3D os elementos IFC vinculados a um item de orçamento (`CustoVinculoBim`) —
 * fecha o DoD da C3 (clicar na linha → ver os elementos). Somente leitura: carrega os modelos
 * envolvidos e chama `selecionarPorGuids`, nada de edição/apontamento aqui.
 *
 * O Viewer3D só existe no DOM enquanto `open` — cada abertura remonta a instância, então
 * `onReady` roda exatamente uma vez por sessão de diálogo, já fechado sobre o `itemId` certo.
 */
export function VerNoModeloDialog({
  itemId,
  itemDescricao,
  open,
  onOpenChange,
}: {
  itemId: string | null;
  itemDescricao: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [carregando, setCarregando] = useState(true);
  const [semVinculo, setSemVinculo] = useState(false);

  async function onReady(engine: ViewerEngine) {
    if (!itemId) return;
    setCarregando(true);
    setSemVinculo(false);

    const r = await buscarGuidsPorItem({ id: itemId });
    if (!r.ok) {
      toast.error(r.error);
      setCarregando(false);
      return;
    }
    if (r.data.length === 0) {
      setSemVinculo(true);
      setCarregando(false);
      return;
    }
    for (const grupo of r.data) {
      await engine.carregarModelo(grupo.uploadId, `/api/coordenacao/frag/${encodeURIComponent(grupo.uploadId)}`);
    }
    await engine.selecionarPorGuids(r.data.flatMap((g) => g.guids));
    await engine.enquadrar();
    setCarregando(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92svh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="border-b px-4 py-2">
          <DialogTitle className="truncate text-sm">Ver no modelo — {itemDescricao}</DialogTitle>
          <DialogDescription className="sr-only">
            Elementos IFC vinculados a este item, destacados no viewer 3D.
          </DialogDescription>
        </DialogHeader>
        <div className="relative flex-1">
          {open && <Viewer3D onReady={onReady} onSelecionar={() => {}} />}
          {carregando && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
              Carregando modelo…
            </div>
          )}
          {semVinculo && !carregando && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Este item ainda não tem elementos vinculados.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
