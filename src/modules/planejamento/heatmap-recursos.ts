import { chaveSemanaIso } from "./disponibilidade";

/**
 * Heatmap de Recursos (L9): a ocupação de cada pessoa por mês soma a alocação DIGITADA (projetos sem
 * cronograma aprovado) com a carga CALCULADA das horas das linhas (projetos aprovados) — a mesma divisão
 * de `cargaDaEquipe`, que ignora a digitada de projeto aprovado para não contar a mesma hora duas vezes.
 *
 * PURO. A carga calculada só existe nas semanas que `cargaDaEquipe` cobre (as próximas 12); fora delas
 * o mês mostra só a digitada — a tela avisa.
 */

/**
 * % da jornada CHEIA que `horas` ocupam numa semana. É a régua da alocação digitada ("50% no projeto"),
 * em que 100 = jornada cheia e a capacidade de quem trabalha meio período é `multiplicador × 100` — a
 * mesma com que a tela compara a ocupação. `semanaUtil` já vem encolhida pelo multiplicador, então a
 * conta volta a escala: quem gasta 20 h numa semana útil de 20 h (multiplicador 0,5) ocupa 50, não 100.
 * Sem semana útil (jornada vazia) não há base: `null`, nunca um número inventado.
 */
export function percentualDaJornadaCheia(horas: number, semanaUtil: number, multiplicador: number): number | null {
  if (!(semanaUtil > 0)) return null;
  return Math.round((horas / semanaUtil) * multiplicador * 100);
}

export type CargaDePessoa = {
  /** Horas da semana útil da pessoa (com feriado, sem descontar férias), já com o multiplicador. */
  semanaUtil: Readonly<Record<string, number>>;
  /** Horas por projeto por semana ISO. */
  porProjeto: Readonly<Record<string, Readonly<Record<string, number>>>>;
};

/**
 * % da jornada cheia ocupado pelas horas dos projetos `calculados`, por semana ISO (`2026-W40`).
 * `multiplicador` é a capacidade do recurso (1 = jornada cheia).
 */
export function percentualCalculadoPorSemana(
  pessoa: CargaDePessoa,
  calculados: readonly string[],
  multiplicador: number,
): Map<string, number> {
  const pct = new Map<string, number>();
  for (const [semana, util] of Object.entries(pessoa.semanaUtil)) {
    const horas = calculados.reduce((s, projetoId) => s + (pessoa.porProjeto[projetoId]?.[semana] ?? 0), 0);
    if (!(horas > 0)) continue;
    const p = percentualDaJornadaCheia(horas, util, multiplicador);
    if (p != null) pct.set(semana, p);
  }
  return pct;
}

export type PicoDoMes = { total: number; digitada: number; calculada: number };

/**
 * O pior dia do mês: digitada do dia + calculada da semana desse dia. Devolve o dia de maior total e
 * as duas parcelas dele, para a tela explicar de onde vem o número.
 */
export function picoDoMes(
  dias: readonly string[],
  digitadaNoDia: (dia: string) => number,
  calculadaPorSemana: ReadonlyMap<string, number>,
): PicoDoMes {
  let melhor: PicoDoMes = { total: 0, digitada: 0, calculada: 0 };
  for (const dia of dias) {
    const digitada = digitadaNoDia(dia);
    const calculada = calculadaPorSemana.get(chaveSemanaIso(dia)) ?? 0;
    if (digitada + calculada > melhor.total) melhor = { total: digitada + calculada, digitada, calculada };
  }
  return melhor;
}
