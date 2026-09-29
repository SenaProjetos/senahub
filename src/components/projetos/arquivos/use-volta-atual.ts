"use client";

import { usePathname, useSearchParams } from "next/navigation";

/**
 * O endereço em que a pessoa está agora (`/caminho?busca`), para levar ao visualizador como `?volta=` e o
 * "← Arquivos" dele devolver à MESMA pasta, filtro e página (reunião de 29/09/2026). Quem valida é
 * `voltaValida` (modules/uploads/volta-visualizador.ts): daqui sai qualquer endereço, lá só passa o que serve.
 */
export function useVoltaAtual(): string {
  const pathname = usePathname();
  const busca = useSearchParams().toString();
  return busca ? `${pathname}?${busca}` : pathname;
}
