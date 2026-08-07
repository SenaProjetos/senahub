import { History, ArrowRight } from "lucide-react";
import { brl, formatarData } from "@/lib/utils";
import { MOTIVO_LABELS, type MotivoContratual } from "@/modules/rh/contratual/motivos";
import type { HistoricoContratualPessoa } from "@/modules/rh/contratual/queries";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Linha do tempo contratual. Componente de SERVIDOR: só renderiza — sem estado, sem ação.
 * Contém remuneração, então quem o monta já tem de ter passado por `rh:folha`.
 */
export function HistoricoContratual({ historico }: { historico: HistoricoContratualPessoa }) {
  if (historico.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Sem histórico contratual"
        description="Alterações de cargo, departamento e salário passam a ser registradas aqui, com data de vigência e autor."
      />
    );
  }

  return (
    <ol className="space-y-3">
      {historico.map((h, i) => (
        <li key={h.id} className="relative rounded-sm border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{formatarData(h.vigenciaEm)}</span>
            {h.motivo && (
              <Badge variant="outline">{MOTIVO_LABELS[h.motivo as MotivoContratual] ?? h.motivo}</Badge>
            )}
            {/* A primeira da lista é a mais recente: é ela que vale hoje. */}
            {i === 0 && <Badge variant="outline" className="border-success text-success">vigente</Badge>}
          </div>

          {h.mudancas.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {h.mudancas.map((m) => (
                <li key={m.campo} className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">{m.campo}:</span>
                  <span className="text-muted-foreground line-through">
                    {m.campo === "Remuneração" ? (m.de ? brl(Number(m.de)) : "—") : (m.de ?? "—")}
                  </span>
                  <ArrowRight className="size-3 text-muted-foreground" />
                  <span className="font-medium">
                    {m.campo === "Remuneração" ? (m.para ? brl(Number(m.para)) : "—") : (m.para ?? "—")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Estado inicial: {h.cargoNome ?? "sem cargo"}
              {h.departamentoNome ? ` · ${h.departamentoNome}` : ""}
              {h.remuneracao != null ? ` · ${brl(h.remuneracao)}` : ""}
            </p>
          )}

          {h.observacao && <p className="mt-2 text-xs text-muted-foreground">{h.observacao}</p>}
          <p className="mt-2 text-xs text-muted-foreground">Registrado por {h.autor}</p>
        </li>
      ))}
    </ol>
  );
}
