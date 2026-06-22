import type { planoVsRealProjeto } from "@/modules/planejamento/queries";

type Dados = Awaited<ReturnType<typeof planoVsRealProjeto>>;

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function PlanoVsReal({ dados }: { dados: Dados }) {
  if (dados.linhas.length === 0) {
    return (
      <div className="rounded-sm border px-4 py-6 text-center text-sm text-muted-foreground">
        Nenhuma sessão de trabalho registrada em {MESES[dados.mes - 1]}/{dados.ano}.
      </div>
    );
  }

  const maxHoras = Math.max(...dados.linhas.map((l) => l.horasReais), 1);

  return (
    <div className="space-y-3 rounded-sm border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Plano × real — {MESES[dados.mes - 1]}/{dados.ano}
        </h3>
        <span className="font-mono text-xs text-muted-foreground">
          total: {dados.totalHoras}h registradas
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="py-2 pr-4 text-left">Pessoa</th>
              <th className="py-2 pr-4 text-right">Alocação</th>
              <th className="py-2 text-right">Horas reais</th>
              <th className="w-40 py-2 pl-4">Proporção</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {dados.linhas.map((l) => (
              <tr key={l.userId}>
                <td className="py-2 pr-4 font-medium">{l.nome}</td>
                <td className="py-2 pr-4 text-right font-mono text-xs text-muted-foreground">
                  {l.percentual > 0 ? `${l.percentual}%` : <span className="italic">sem alocação</span>}
                </td>
                <td className={`py-2 text-right font-mono text-xs font-bold tabular-nums ${l.horasReais === 0 ? "text-muted-foreground" : ""}`}>
                  {l.horasReais}h
                </td>
                <td className="py-2 pl-4">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${l.percentual === 0 ? "bg-warning" : "bg-primary"}`}
                      style={{ width: `${(l.horasReais / maxHoras) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dados.linhas.some((l) => l.percentual === 0) && (
        <p className="text-[11px] text-warning">
          Linhas em amarelo = horas registradas sem alocação planejada no projeto.
        </p>
      )}
    </div>
  );
}
