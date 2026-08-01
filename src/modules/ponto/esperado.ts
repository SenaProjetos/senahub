/**
 * Horas ESPERADAS do mês — fonte única de verdade.
 *
 * Helper PURO (sem I/O, sem Prisma/React, client-safe — sem `server-only`),
 * no mesmo padrão de `lib/encargos.ts` / `lib/aging.ts`. Existe porque a mesma
 * regra estava escrita duas vezes em `queries.ts` com resultados DIFERENTES:
 * `espelhoMes` aplicava um escalar (o MAIOR `horasDia` da semana) a todo seg–sex,
 * enquanto `espelhoDetalhado` usava o `horasDia` real do dia da semana. Quem tem
 * escala não-uniforme (8h seg–qui + 4h sex, ou sábado ativo) via o total do mês
 * discordar do detalhe por dia. Agora os dois leem ESTE mapa — concordam por
 * construção, não por convenção.
 *
 * Regras:
 * - Um dia só gera horas esperadas se a grade daquele dia da semana está ativa.
 * - Feriado e férias aprovadas zeram o dia (não debitam banco de horas).
 * - Fora do período do vínculo (antes do `piso`, depois do `teto`) → 0. É a
 *   correção do bug em que quem foi admitido dia 20 levava 19 dias de débito e
 *   quem saiu dia 10 seguia acumulando até o fim do mês.
 * - `controlaJornada: false` (PJ, autônomo, pró-labore) → mês inteiro zerado:
 *   quem não tem jornada controlada não acumula falta em NENHUM cálculo de saldo.
 *
 * Datas são sempre `YYYY-MM-DD` (ISO local de Brasília, produzido por
 * `engine.diaLocal`): comparação lexicográfica == cronológica, e o dia da semana
 * sai de `Date.UTC` — aritmética de calendário pura, imune ao fuso do servidor
 * (o SO é Windows e pode estar em qualquer fuso).
 */

/** Um dia da grade semanal. Índice 0 = domingo … 6 = sábado. */
export type DiaEscalaEsperado = { ativo: boolean; horasDia: number };

export type EntradaEsperado = {
  ano: number;
  mes: number;
  /** Grade semanal vigente (7 posições, 0=domingo) — override do usuário ou do perfil. */
  escala: DiaEscalaEsperado[];
  /** Dias ISO de feriado dentro do mês. */
  feriados: ReadonlySet<string>;
  /** Dias ISO de férias aprovadas dentro do mês. */
  ferias: ReadonlySet<string>;
  /**
   * Primeiro dia ISO apurável — `max(início do vínculo, primeiro registro de
   * ponto)`. `null` = sem piso (apura o mês inteiro).
   */
  piso: string | null;
  /** Último dia ISO apurável — fim do vínculo. `null` = sem teto. */
  teto: string | null;
  /** `false` zera o mês inteiro (contratação sem jornada controlada). */
  controlaJornada: boolean;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Quantidade de dias do mês (aritmética de calendário, sem fuso). */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Dia da semana (0=domingo..6=sábado) de um `YYYY-MM-DD`. Sem dependência de fuso. */
export function diaSemanaISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Minutos esperados por dia do mês (`YYYY-MM-DD` → minutos). Todo dia do mês
 * aparece no mapa, inclusive os zerados — o cliente usa o mapa completo para
 * filtrar por período (dia/semana/mês) sem precisar reconstruir o calendário.
 */
export function esperadoPorDiaMes(e: EntradaEsperado): Record<string, number> {
  const prefixo = `${e.ano}-${pad2(e.mes)}-`;
  const total = diasNoMes(e.ano, e.mes);
  const mapa: Record<string, number> = {};

  for (let d = 1; d <= total; d++) {
    const iso = `${prefixo}${pad2(d)}`;
    mapa[iso] = e.controlaJornada ? minutosDoDia(iso, e) : 0;
  }
  return mapa;
}

function minutosDoDia(iso: string, e: EntradaEsperado): number {
  if (e.piso && iso < e.piso) return 0;
  if (e.teto && iso > e.teto) return 0;
  if (e.feriados.has(iso) || e.ferias.has(iso)) return 0;
  const grade = e.escala[diaSemanaISO(iso)];
  if (!grade?.ativo) return 0;
  return Math.round(grade.horasDia * 60);
}

/**
 * Soma o esperado só até `ateISO` (inclusive) — dias ainda não decorridos não
 * entram, senão o saldo do mês corrente nasce com o mês inteiro negativo.
 * Mês passado → soma tudo; mês futuro → 0.
 */
export function somarEsperadoAte(mapa: Record<string, number>, ateISO: string): number {
  let total = 0;
  for (const [iso, min] of Object.entries(mapa)) {
    if (iso <= ateISO) total += min;
  }
  return total;
}

/**
 * Piso de apuração do usuário: `max(início do vínculo, primeiro registro de
 * ponto)`. Os dois importam — o vínculo porque ninguém deve horas antes de ser
 * contratado, e o primeiro registro porque o ponto eletrônico entrou em uso
 * depois de vários vínculos já existirem (cobrar o período anterior transforma
 * "sistema ainda não existia" em falta). Ambos `null` → sem piso.
 */
export function pisoApuracao(
  inicioVinculo: string | null,
  primeiroRegistro: string | null,
): string | null {
  if (!inicioVinculo) return primeiroRegistro;
  if (!primeiroRegistro) return inicioVinculo;
  return inicioVinculo > primeiroRegistro ? inicioVinculo : primeiroRegistro;
}
