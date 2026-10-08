/**
 * Painel de gestão de pessoas (Gestão de Pessoas F6) — sinais de atenção puros e explicáveis.
 * Decisões do dono (2026-10-05): os cinco sinais; superalocação "recorrente" = 3 semanas seguidas;
 * clima só com 3+ respostas. Proibido por desenho: nota de desempenho, risco de desligamento,
 * humor individual e ranking de pessoas — nenhuma função aqui produz isso.
 */

export const SEMANAS_SEGUIDAS = 3;
export const CLIMA_MINIMO = 3;
/** Horas reais acima da capacidade (em %) para contar uma semana como "acima da escala". */
export const FOLGA_ESCALA_PCT = 10;

export type TipoSinal = "superalocacao" | "horas_acima" | "lacuna_marco" | "um_a_um" | "onboarding_parado";

export type Sinal = {
  tipo: TipoSinal;
  titulo: string;
  /** De onde vem o número — o gestor precisa conseguir explicar o alerta. */
  fonte: string;
  periodo: string;
  acao: { rotulo: string; href: string };
};

/** Maior sequência de semanas seguidas (na ordem dada) em que `acima` vale. */
export function maiorSequencia(semanas: readonly string[], acima: (semana: string) => boolean): { tamanho: number; de: string | null; ate: string | null } {
  let melhor = { tamanho: 0, de: null as string | null, ate: null as string | null };
  let atual = 0;
  let inicio: string | null = null;
  for (const s of semanas) {
    if (acima(s)) {
      if (atual === 0) inicio = s;
      atual++;
      if (atual > melhor.tamanho) melhor = { tamanho: atual, de: inicio, ate: s };
    } else atual = 0;
  }
  return melhor;
}

/** Superalocação recorrente: carga planejada acima da capacidade em N semanas seguidas. */
export function superalocacaoRecorrente(
  pessoas: readonly { userId: string; nome: string; carga: Readonly<Record<string, number>>; capacidade: Readonly<Record<string, number>> }[],
  semanas: readonly string[],
  minimo = SEMANAS_SEGUIDAS,
) {
  return pessoas
    .map((p) => ({ ...p, seq: maiorSequencia(semanas, (s) => (p.carga[s] ?? 0) > (p.capacidade[s] ?? 0) && (p.carga[s] ?? 0) > 0) }))
    .filter((p) => p.seq.tamanho >= minimo)
    .map((p) => ({ userId: p.userId, nome: p.nome, semanas: p.seq.tamanho, de: p.seq.de!, ate: p.seq.ate! }));
}

/**
 * Horas acima da escala: horas REAIS (ponto) acima da capacidade + 10% em pelo menos `minimo`
 * semanas da janela. Semana sem capacidade (férias, sem jornada) não conta.
 */
export function horasAcimaDaEscala(
  linhas: readonly { userId: string; nome: string; porSemana: Readonly<Record<string, number>>; capacidadePorSemana: Readonly<Record<string, number>> }[],
  semanas: readonly string[],
  minimo = 2,
) {
  return linhas
    .map((l) => {
      const acima = semanas.filter((s) => {
        const cap = l.capacidadePorSemana[s] ?? 0;
        return cap > 0 && (l.porSemana[s] ?? 0) > cap * (1 + FOLGA_ESCALA_PCT / 100);
      });
      const excesso = acima.reduce((t, s) => t + (l.porSemana[s] ?? 0) - (l.capacidadePorSemana[s] ?? 0), 0);
      return { userId: l.userId, nome: l.nome, semanas: acima.length, excessoHoras: Math.round(excesso * 10) / 10 };
    })
    .filter((l) => l.semanas >= minimo);
}

/** Clima: abaixo do mínimo de respostas, não mostra recorte nenhum (daria para adivinhar quem). */
export function climaVisivel(total: number): boolean {
  return total >= CLIMA_MINIMO;
}
