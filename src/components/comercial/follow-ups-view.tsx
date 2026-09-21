"use client";

import { useMemo, useState } from "react";
import { CalendarClock, CalendarDays, List } from "lucide-react";
import type { FollowUpComercial } from "@/modules/comercial/queries";
import {
  ORDEM_GRUPOS_FOLLOWUP,
  ROTULO_GRUPO_FOLLOWUP,
  agruparFollowUps,
} from "@/modules/comercial/follow-ups";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AcaoLinha } from "./acao-linha";
import { FollowUpsCalendario } from "./follow-ups-calendario";

type Modo = "calendario" | "lista";

/** Calendário é a visão principal; a lista agrupada por urgência continua a um clique. */
export function FollowUpsView({
  itens,
  truncado,
  podeGerir,
}: {
  itens: FollowUpComercial[];
  truncado: boolean;
  podeGerir: boolean;
}) {
  const [modo, setModo] = useState<Modo>("calendario");

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
    <div className="space-y-3">
      <div className="flex items-center gap-1" role="group" aria-label="Forma de exibição">
        <Button size="sm" variant={modo === "calendario" ? "secondary" : "outline"} aria-pressed={modo === "calendario"} onClick={() => setModo("calendario")}>
          <CalendarDays className="size-3.5" /> Calendário
        </Button>
        <Button size="sm" variant={modo === "lista" ? "secondary" : "outline"} aria-pressed={modo === "lista"} onClick={() => setModo("lista")}>
          <List className="size-3.5" /> Lista
        </Button>
      </div>

      {modo === "calendario" ? (
        <FollowUpsCalendario itens={itens} podeGerir={podeGerir} onVerAtrasados={() => setModo("lista")} />
      ) : (
        <ListaFollowUps itens={itens} />
      )}

      {truncado && (
        <p className="text-xs text-muted-foreground">
          Mostrando as ações mais antigas. Conclua ou reagende algumas para ver as seguintes.
        </p>
      )}
    </div>
  );
}

function ListaFollowUps({ itens }: { itens: FollowUpComercial[] }) {
  const agora = useMemo(() => new Date(), []);
  const grupos = useMemo(() => agruparFollowUps(itens, agora), [itens, agora]);

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
    </div>
  );
}
