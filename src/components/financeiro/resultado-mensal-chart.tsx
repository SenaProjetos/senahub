import type { MesResultado } from "@/modules/financeiro/relatorios/queries";

function brlCurto(v: number) {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Resultado mensal (receita − despesa realizadas): barras divergentes (verde/vermelho). */
export function ResultadoMensalChart({ dados }: { dados: MesResultado[] }) {
  const max = Math.max(1, ...dados.map((d) => Math.abs(d.resultado)));
  return (
    <div className="flex h-44 items-stretch gap-2">
      {dados.map((d) => {
        const altura = (Math.abs(d.resultado) / max) * 50; // % de cada metade
        const positivo = d.resultado >= 0;
        return (
          <div key={d.mes} className="flex flex-1 flex-col items-center" title={`${d.rotulo}: R$ ${d.resultado.toLocaleString("pt-BR")}`}>
            <div className="relative flex h-32 w-full flex-col justify-center">
              {/* metade superior (positivo) */}
              <div className="flex flex-1 items-end justify-center">
                {positivo && (
                  <div className="w-2/3 bg-success" style={{ height: `${altura}%` }} />
                )}
              </div>
              {/* linha do zero */}
              <div className="h-px w-full bg-border" />
              {/* metade inferior (negativo) */}
              <div className="flex flex-1 items-start justify-center">
                {!positivo && d.resultado !== 0 && (
                  <div className="w-2/3 bg-destructive" style={{ height: `${altura}%` }} />
                )}
              </div>
            </div>
            <span className="mt-1 font-mono text-[9px] text-muted-foreground">{brlCurto(d.resultado)}</span>
            <span className="text-xs font-medium capitalize">{d.rotulo}</span>
          </div>
        );
      })}
    </div>
  );
}
