"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSetParams } from "@/lib/use-set-param";

/**
 * Navegação por aba lida no SERVIDOR (`?aba=`), não em `useState` — divergência
 * deliberada de `contas-pagar-receber-view` (lá o servidor só sugere a aba inicial).
 * Aqui a página busca só os dados da aba ativa, então o estado tem que morar na URL.
 */
export function ProducaoAbas({ aba, children }: { aba: "pagar" | "lotes"; children: ReactNode }) {
  const setParams = useSetParams();

  return (
    <Tabs value={aba} onValueChange={(v) => v && setParams({ aba: v === "pagar" ? null : v })}>
      <TabsList>
        <TabsTrigger value="pagar">Pagamentos</TabsTrigger>
        <TabsTrigger value="lotes">Lotes mensais</TabsTrigger>
      </TabsList>
      <TabsContent value={aba}>{children}</TabsContent>
    </Tabs>
  );
}
