import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { planoVsRealProjeto } from "@/modules/planejamento/queries";

type PlanoReal = Awaited<ReturnType<typeof planoVsRealProjeto>>;

export function PlanoRealCard({ planoReal }: { planoReal: PlanoReal }) {
  const mesNome = new Date(planoReal.ano, planoReal.mes - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Plano × real · {mesNome}</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-1.5 font-medium">Pessoa</th>
              <th className="py-1.5 text-right font-medium">Alocado</th>
              <th className="py-1.5 text-right font-medium">Horas reais (mês)</th>
            </tr>
          </thead>
          <tbody>
            {planoReal.linhas.map((l) => (
              <tr key={l.userId} className="border-b last:border-0">
                <td className="py-1.5">{l.nome}</td>
                <td className="py-1.5 text-right font-mono">
                  {l.percentual > 0 ? (
                    `${l.percentual}%`
                  ) : (
                    <span className="text-warning">sem alocação</span>
                  )}
                </td>
                <td className="py-1.5 text-right font-mono">
                  {l.horasReais.toLocaleString("pt-BR")} h
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted-foreground">
          Total de {planoReal.totalHoras.toLocaleString("pt-BR")} h lançadas no projeto neste mês.
          "Sem alocação" indica esforço não planejado.
        </p>
      </CardContent>
    </Card>
  );
}
