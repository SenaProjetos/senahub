import { Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtHoras } from "@/modules/ponto/format";
import { diaLocal, horaLocal } from "@/modules/ponto/engine";
import type { RegistrosDiariosProjeto } from "@/modules/ponto/registros-projeto";
import { formatarData } from "@/lib/utils";

type Props = {
  registros: RegistrosDiariosProjeto[];
};

function rotuloDia(dia: string) {
  return formatarData(`${dia}T12:00:00-03:00`);
}

/** Lista gerencial das sessões de trabalho do projeto, limitada pela query aos últimos sete dias. */
export function RegistrosPontoProjeto({ registros }: Props) {
  const hoje = diaLocal(new Date());
  const totalMinutos = registros.reduce((total, grupo) => total + grupo.totalMinutos, 0);

  if (registros.length === 0) {
    return (
      <EmptyState
        icon={Clock3}
        title="Nenhuma hora registrada"
        description="Ainda não há jornadas ou apontamentos neste projeto nos últimos 7 dias."
        className="border-0 py-6 shadow-none"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 border-b pb-2 text-xs">
        <span className="text-muted-foreground">Últimos 7 dias</span>
        <span className="font-mono font-semibold tabular-nums text-primary">{fmtHoras(totalMinutos)}</span>
      </div>

      <div className="space-y-3">
        {registros.map((grupo) => (
          <section key={grupo.dia} aria-label={`Registros de ${rotuloDia(grupo.dia)}`}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold">{rotuloDia(grupo.dia)}</h3>
                {grupo.dia === hoje && <Badge variant="secondary">Hoje</Badge>}
              </div>
              <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                {fmtHoras(grupo.totalMinutos)}
              </span>
            </div>

            <ul className="divide-y border">
              {grupo.registros.map((registro) => (
                <li key={registro.id} className="flex items-center justify-between gap-3 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{registro.colaborador.nome}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {horaLocal(registro.inicio)}
                      {registro.fim ? ` – ${horaLocal(registro.fim)}` : " – Em andamento"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">{registro.tipo === "jornada" ? "Jornada" : "Apontamento"}</Badge>
                    <span className="font-mono text-xs font-semibold tabular-nums">{fmtHoras(registro.minutos)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
