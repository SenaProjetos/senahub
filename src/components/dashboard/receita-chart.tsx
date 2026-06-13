type Bucket = { rotulo: string; realizado: number; previsto: number };

function brlCurto(v: number) {
  if (v >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Gráfico de barras (realizado × previsto) por mês — SVG/CSS puro, sem dependência. */
export function ReceitaChart({ dados }: { dados: Bucket[] }) {
  const max = Math.max(1, ...dados.map((d) => Math.max(d.realizado, d.previsto)));
  return (
    <div>
      <div className="mb-3 flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 bg-primary" /> Realizado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 border border-primary/50 bg-primary/15" /> Previsto
        </span>
      </div>
      <div className="flex h-40 items-end gap-3">
        {dados.map((d) => (
          <div key={d.rotulo} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-32 w-full items-end justify-center gap-1">
              <div
                className="w-1/2 bg-primary transition-all"
                style={{ height: `${(d.realizado / max) * 100}%` }}
                title={`Realizado: R$ ${d.realizado.toLocaleString("pt-BR")}`}
              />
              <div
                className="w-1/2 border border-primary/50 bg-primary/15 transition-all"
                style={{ height: `${(d.previsto / max) * 100}%` }}
                title={`Previsto: R$ ${d.previsto.toLocaleString("pt-BR")}`}
              />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{brlCurto(d.realizado)}</span>
            <span className="text-xs font-medium capitalize">{d.rotulo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
