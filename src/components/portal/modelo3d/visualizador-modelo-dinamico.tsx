"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * O visualizador 3D do portal só no navegador (`ssr: false` não é permitido numa página de servidor, por isso este
 * invólucro de cliente): o three/fragments nunca entra no servidor nem no pacote inicial.
 */
export const VisualizadorModeloDinamico = dynamic(
  () => import("@/components/portal/modelo3d/visualizador-modelo").then((m) => m.VisualizadorModelo),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2" aria-busy="true">
        <span role="status" className="sr-only">
          Carregando o visualizador 3D…
        </span>
        <Skeleton className="h-[60svh] w-full" />
      </div>
    ),
  },
);
