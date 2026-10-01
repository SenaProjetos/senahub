import type { MesResultado } from "@/modules/financeiro/relatorios/queries";

/** Valor curto com o sinal escrito (+12k, −3k): a cor da barra só reforça. */
function brlCurto(v: number) {
  const sinal = v > 0 ? "+" : v < 0 ? "−" : "";
  const a = Math.abs(v);
  const n = a >= 1000 ? `${(a / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k` : a.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return `${sinal}${n}`;
}

/** Resultado mensal (receita − despesa realizadas): barras divergentes (verde/vermelho). */
export function ResultadoMensalChart({ dados }: { dados: MesResultado[] }) {
  const max = Math.max(1, ...dados.map((d) => Math.abs(d.resultado)));
  return (
    <div
      role="img"
      aria-label={`Resultado mensal, receita menos despesa realizadas: ${dados.map((d) => `${d.rotulo} ${brlCurto(d.resultado)}`).join(", ")}.`}
      className="flex h-44 items-stretch gap-2"
    >
      {dados.map((d) => {
        const altura = (Math.abs(d.resultado) / max) * 50; // % de cada metade
        const positivo = d.resultado >= 0;
        return (
          <div key={d.mes} className="flex flex-1 flex-col items-center" title={`${d.rotulo}: ${brlCurto(d.resultado)}`}>
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
