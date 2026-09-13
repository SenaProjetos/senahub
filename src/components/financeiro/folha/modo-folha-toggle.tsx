"use client";

import { Users, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSetParams } from "@/lib/use-set-param";

/**
 * Alterna entre os dois modos de leitura da aba Pagamentos (N1 do plano): agrupado por
 * projetista (padrão) ou tabela plana por pagamento. Estado na URL (`?modo=`) — o link é
 * compartilhável, e trocar de modo não deveria perder filtro nem paginação dos dois lados.
 */
export function ModoFolhaToggle({ modo }: { modo: "projetista" | "pagamento" }) {
  const setParams = useSetParams();
  return (
    <div role="group" aria-label="Modo de exibição" className="inline-flex gap-1 rounded-lg bg-muted p-[3px]">
      <Button
        size="sm"
        variant={modo === "projetista" ? "secondary" : "ghost"}
        aria-pressed={modo === "projetista"}
        onClick={() => setParams({ modo: null })}
      >
        <Users className="size-3.5" /> Por projetista
      </Button>
      <Button
        size="sm"
        variant={modo === "pagamento" ? "secondary" : "ghost"}
        aria-pressed={modo === "pagamento"}
        onClick={() => setParams({ modo: "pagamento" })}
      >
        <List className="size-3.5" /> Por pagamento
      </Button>
    </div>
  );
}
