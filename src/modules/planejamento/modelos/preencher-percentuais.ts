/**
 * Percentuais do modelo nas etapas JÁ semeadas (decisão do dono, 2026-10-10). Regra pura, sem I/O.
 *
 * Toda disciplina nasce com as etapas a 0% (`semearEtapasPadrao`), e `aplicarModelo` só cadastra fase em
 * disciplina que não tem nenhuma — então, sem esta regra, os percentuais que o time conferiu no modelo
 * (D38) nunca chegariam ao projeto. Aqui o modelo PREENCHE as etapas, mas só quando isso é seguro:
 *
 *  - a disciplina recebeu linha do modelo (é dela que o modelo está falando);
 *  - TODAS as etapas dela estão em 0% e nenhuma teve o pagamento liberado — quem já preencheu à mão, ou já
 *    pagou, não é tocado;
 *  - o modelo traz percentual para CADA etapa da disciplina e a soma delas fecha 100% — unifamiliar, que não
 *    tem Estudo Preliminar, não recebe 40 + 40 = 80% (a soma que não fecha trava o pagamento por fase, e
 *    "preencher pela metade" esconderia o erro).
 */
export type EtapaDaDisciplina = { etapaId: string; percentual: number; liberada: boolean };

export type PercentualAPreencher = { disciplinaId: string; etapaId: string; percentual: number };

const centavos = (v: number) => Math.round(v * 100);

export function percentuaisAPreencher(p: {
  percentuaisPorFase: Readonly<Record<string, number>>;
  disciplinas: readonly { disciplinaId: string; etapas: readonly EtapaDaDisciplina[] }[];
  /** Disciplinas do projeto que receberam linha do modelo. */
  disciplinasComLinha: ReadonlySet<string>;
}): PercentualAPreencher[] {
  const out: PercentualAPreencher[] = [];
  for (const d of p.disciplinas) {
    if (!p.disciplinasComLinha.has(d.disciplinaId) || d.etapas.length === 0) continue;
    if (d.etapas.some((e) => e.liberada || centavos(e.percentual) !== 0)) continue;
    if (d.etapas.some((e) => !Number.isFinite(p.percentuaisPorFase[e.etapaId]))) continue;
    const soma = d.etapas.reduce((s, e) => s + centavos(p.percentuaisPorFase[e.etapaId]), 0);
    if (soma !== 10_000) continue;
    for (const e of d.etapas) out.push({ disciplinaId: d.disciplinaId, etapaId: e.etapaId, percentual: p.percentuaisPorFase[e.etapaId] });
  }
  return out;
}
