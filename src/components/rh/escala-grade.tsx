type DiaGrade = {
  diaSemana: number;
  ativo: boolean;
  entrada: string | null;
  saida: string | null;
  descansos: { inicio: string; fim: string }[];
  horasDia: number;
  toleranciaMin: number;
};

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Grade semanal de escala (somente leitura). Mostra a escala própria do usuário
 * (override) ou a herdada do perfil quando não há override. Presentational e puro
 * — reusado na ficha 360 (RH) e no espelho de escala do próprio colaborador.
 */
export function EscalaGrade({
  temOverride,
  dias,
  roleDias,
}: {
  temOverride: boolean;
  dias: DiaGrade[];
  roleDias: DiaGrade[];
}) {
  const linhas = temOverride ? dias : roleDias;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {temOverride ? "Escala própria (override do perfil)." : "Herdada do perfil (sem escala própria)."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Dia</th>
              <th className="py-2 pr-3 font-medium">Entrada</th>
              <th className="py-2 pr-3 font-medium">Saída</th>
              <th className="py-2 pr-3 font-medium">Descansos</th>
              <th className="py-2 font-medium">Horas</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((d) => (
              <tr key={d.diaSemana} className={`border-b ${d.ativo ? "" : "text-muted-foreground"}`}>
                <td className="py-2 pr-3 font-medium">{DIAS[d.diaSemana]}</td>
                <td className="py-2 pr-3">{d.ativo ? (d.entrada ?? "—") : "folga"}</td>
                <td className="py-2 pr-3">{d.ativo ? (d.saida ?? "—") : ""}</td>
                <td className="py-2 pr-3">{d.descansos.map((r) => `${r.inicio}–${r.fim}`).join(", ") || "—"}</td>
                <td className="py-2">{d.ativo ? `${d.horasDia}h` : "0h"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
