"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// A tela da sobreposição puxa canvas, pdf.js e o parser de DXF: fica fora do bundle inicial.
// `ssr: false` não vale em Server Component, por isso este carregador cliente existe.
export const SobreposicaoViewCarregador = dynamic(
  () => import("./sobreposicao-view").then((m) => m.SobreposicaoView),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[60vh] w-full" aria-label="Carregando a sobreposição" />,
  },
);
