"use client";

import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import type { FollowUpComercial } from "@/modules/comercial/queries";
import {
  ORDEM_GRUPOS_FOLLOWUP,
  ROTULO_GRUPO_FOLLOWUP,
  agruparFollowUps,
} from "@/modules/comercial/follow-ups";
import { EmptyState } from "@/components/ui/empty-state";
import { AcaoLinha } from "./acao-linha";

export function FollowUpsView({ itens, truncado }: { itens: FollowUpComercial[]; truncado: boolean }) {
  const agora = useMemo(() => new Date(), []);
  const grupos = useMemo(() => agruparFollowUps(itens, agora), [itens, agora]);

  if (itens.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nenhum follow-up em aberto"
        description="Agende o próximo contato pela ficha de um card do funil."
      />
    );
  }

  return (
    <div className="space-y-5">
      {ORDEM_GRUPOS_FOLLOWUP.map((g) =>
        grupos[g].length === 0 ? null : (
          <section key={g} className="space-y-1.5">
            <h3 className={`text-sm font-bold ${g === "atrasados" ? "text-destructive" : ""}`}>
              {ROTULO_GRUPO_FOLLOWUP[g]} <span className="font-mono text-xs text-muted-foreground">({grupos[g].length})</span>
            </h3>
            {grupos[g].map((it) => (
              <AcaoLinha key={it.id} item={it} atrasada={g === "atrasados"} />
            ))}
          </section>
        ),
      )}
      {truncado && (
        <p className="text-xs text-muted-foreground">
          Mostrando as ações mais antigas. Conclua ou reagende algumas para ver as seguintes.
        </p>
      )}
    </div>
  );
}
