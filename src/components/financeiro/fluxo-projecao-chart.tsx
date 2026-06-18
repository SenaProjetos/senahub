import type { SemanaProjecao } from "@/modules/financeiro/caixa/queries";

function brlCurto(v: number) {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function dataCurta(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Linha/área do saldo projetado semana a semana (SVG, sem dependência de chart lib).
 * Ponto 0 = saldo atual; demais = saldo ao fim de cada semana (de `projecaoCaixa`).
 */
export function FluxoProjecaoChart({
  dados,
  saldoInicial,
}: {
  dados: SemanaProjecao[];
  saldoInicial: number;
}) {
  const pontos = [
    { rotulo: "Agora", saldo: saldoInicial },
    ...dados.map((d) => ({ rotulo: dataCurta(d.inicio), saldo: d.saldo })),
  ];
  const saldos = pontos.map((p) => p.saldo);
  const max = Math.max(0, ...saldos);
  const min = Math.min(0, ...saldos);
  const span = max - min || 1;

  const W = 100;
  const H = 40;
  const x = (i: number) => (pontos.length <= 1 ? 0 : (i / (pontos.length - 1)) * W);
  const y = (v: number) => H - ((v - min) / span) * H;
  const yZero = y(0);

  const linha = pontos.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(p.saldo).toFixed(2)}`).join(" ");
  const area = `${linha} L ${W.toFixed(2)} ${H} L 0 ${H} Z`;

  const final = pontos[pontos.length - 1].saldo;
  const temGap = saldos.some((s) => s < 0);
  const piorSaldo = Math.min(...saldos);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">Saldo projetado (8 semanas)</span>
        <span className={`font-mono text-sm font-semibold ${final < 0 ? "text-destructive" : "text-success"}`}>
          {brlCurto(final)}
        </span>
      </div>
      <div className="relative h-40 w-full">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
          {/* área sob a linha */}
          <path d={area} className="fill-primary/10" />
          {/* linha do zero (se houver negativo) */}
          {min < 0 && (
            <line
              x1="0"
              x2={W}
              y1={yZero}
              y2={yZero}
              className="stroke-destructive/40"
              strokeWidth={0.4}
              strokeDasharray="1.5 1.5"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {/* linha do saldo */}
          <path
            d={linha}
            fill="none"
            className={temGap ? "stroke-destructive" : "stroke-primary"}
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* pontos */}
          {pontos.map((p, i) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(p.saldo)}
              r={1.1}
              className={p.saldo < 0 ? "fill-destructive" : "fill-primary"}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        {pontos.map((p, i) => (
          <span key={i} className={i === 0 || i === pontos.length - 1 ? "" : "hidden sm:inline"}>
            {p.rotulo}
          </span>
        ))}
      </div>
      {temGap && (
        <p className="text-xs text-destructive">
          Saldo fica negativo na projeção (mínimo {brlCurto(piorSaldo)}). Reprograme pagamentos ou antecipe recebimentos.
        </p>
      )}
    </div>
  );
}
