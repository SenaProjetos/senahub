/**
 * Calendário de trabalho — regra única de "quais dias contam" no cronograma.
 *
 * PURO: sem I/O, sem Prisma, sem React. Recebe os feriados prontos e devolve contas de
 * dia útil. Quem lê o banco é o adaptador em `modules/planejamento`, que monta o
 * calendário a partir de `feriadosParaCalculo(ano)` — a MESMA função que o ponto usa para
 * calcular horas esperadas. Duas definições de "dia útil" no sistema seria a primeira
 * coisa a divergir: o prazo diria uma coisa e a folha outra.
 *
 * TUDO em `YYYY-MM-DD`, nunca `Date`. Não é preferência de estilo: prazo é dia-calendário
 * (ver `lib/data.ts`), e o único jeito de não errar por fuso é nunca construir um instante.
 * Os outros módulos puros de planejamento (`motor`, `disponibilidade`) já fazem assim.
 *
 * DURAÇÃO É INCLUSIVA: uma tarefa de 5 dias que começa na segunda termina na sexta, não no
 * sábado. Marco tem duração 0 e termina no próprio dia de início (Doc 03 §11).
 */

/** Dia-calendário no formato `YYYY-MM-DD`. */
export type Dia = string;

export type Calendario = {
  /** Dias da semana que contam, 0 = domingo … 6 = sábado. */
  readonly diasSemana: ReadonlySet<number>;
  /** Feriados, em `YYYY-MM-DD`. Fixos e móveis já resolvidos por quem montou. */
  readonly feriados: ReadonlySet<Dia>;
};

/** Segunda a sexta — o calendário da empresa (D8). */
export const DIAS_UTEIS_PADRAO: ReadonlySet<number> = new Set([1, 2, 3, 4, 5]);

/**
 * Teto de iterações das buscas por dia útil. Existe para transformar um calendário
 * impossível (nenhum dia da semana útil, ou um feriado cobrindo anos) num erro claro em
 * vez de um laço infinito que trava o servidor. 20 anos de dias é folga suficiente para
 * qualquer cronograma real e apertado o bastante para falhar rápido.
 */
const LIMITE_BUSCA = 366 * 20;

const MS_DIA = 86_400_000;
const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `YYYY-MM-DD` → número de dias desde a época, em UTC (nunca vira horário local).
 *
 * Confere a volta de propósito: `Date.UTC` NÃO recusa mês 13 nem 30 de fevereiro — ele
 * rola para o mês seguinte em silêncio. Sem esta checagem, `2026-13-01` viraria
 * 2026-01-01 de 2027 e o cronograma inteiro sairia deslocado um ano sem erro nenhum.
 */
function paraNumero(dia: Dia): number {
  const m = RE_DIA.exec(dia);
  if (!m) throw new Error(`Dia inválido: ${JSON.stringify(dia)} (esperado YYYY-MM-DD).`);
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(t)) throw new Error(`Dia inválido: ${dia}.`);
  const n = Math.round(t / MS_DIA);
  if (paraDia(n) !== dia) throw new Error(`Dia inexistente no calendário: ${dia}.`);
  return n;
}

/** Número de dias desde a época → `YYYY-MM-DD`. */
function paraDia(n: number): Dia {
  return new Date(n * MS_DIA).toISOString().slice(0, 10);
}

/** Dia da semana (0 = domingo) sem passar por horário local. */
function diaDaSemana(n: number): number {
  return new Date(n * MS_DIA).getUTCDay();
}

export function criarCalendario(opcoes?: {
  diasSemana?: Iterable<number>;
  feriados?: Iterable<Dia>;
}): Calendario {
  const diasSemana = opcoes?.diasSemana ? new Set(opcoes.diasSemana) : new Set(DIAS_UTEIS_PADRAO);
  if (diasSemana.size === 0) throw new Error("Calendário sem nenhum dia útil na semana.");
  const feriados = new Set<Dia>();
  for (const f of opcoes?.feriados ?? []) {
    paraNumero(f); // valida o formato aqui, e não na primeira conta do motor
    feriados.add(f);
  }
  return { diasSemana, feriados };
}

function ehUtilNum(n: number, cal: Calendario): boolean {
  return cal.diasSemana.has(diaDaSemana(n)) && !cal.feriados.has(paraDia(n));
}

export function ehDiaUtil(dia: Dia, cal: Calendario): boolean {
  return ehUtilNum(paraNumero(dia), cal);
}

function buscar(n: number, passo: 1 | -1, cal: Calendario): number {
  let atual = n;
  for (let i = 0; i <= LIMITE_BUSCA; i++) {
    if (ehUtilNum(atual, cal)) return atual;
    atual += passo;
  }
  throw new Error(
    `Nenhum dia útil encontrado a partir de ${paraDia(n)} em ${LIMITE_BUSCA} dias — ` +
      "calendário sem dias úteis suficientes.",
  );
}

/** O próprio dia, se for útil; senão o próximo dia útil. */
export function proximoDiaUtil(dia: Dia, cal: Calendario): Dia {
  return paraDia(buscar(paraNumero(dia), 1, cal));
}

/** O próprio dia, se for útil; senão o dia útil anterior. */
export function diaUtilAnterior(dia: Dia, cal: Calendario): Dia {
  return paraDia(buscar(paraNumero(dia), -1, cal));
}

/**
 * O primeiro dia útil DEPOIS de `dia` — nunca o próprio. É o "após a Data de Status" do MS Project:
 * status na sexta → segunda; no sábado → segunda; véspera de feriado → o útil depois dele.
 *
 * Não é `somarDiasUteis(dia, 1)`: aquela normaliza o ponto de partida ANTES de andar, e a partir de um
 * sábado cairia na terça.
 */
export function diaUtilApos(dia: Dia, cal: Calendario): Dia {
  return paraDia(buscar(paraNumero(dia) + 1, 1, cal));
}

/**
 * Anda `n` DIAS ÚTEIS a partir de `dia`. `n` pode ser negativo (anda para trás) e 0
 * apenas normaliza para o dia útil mais próximo na direção pedida.
 *
 * O ponto de partida é normalizado primeiro: somar 2 dias úteis a um sábado conta a
 * partir da segunda, não do sábado.
 */
export function somarDiasUteis(dia: Dia, n: number, cal: Calendario): Dia {
  if (!Number.isInteger(n)) throw new Error(`Dias úteis deve ser inteiro, veio ${n}.`);
  const passo: 1 | -1 = n < 0 ? -1 : 1;
  let atual = buscar(paraNumero(dia), passo, cal);
  let restantes = Math.abs(n);
  let voltas = 0;
  while (restantes > 0) {
    atual += passo;
    if (++voltas > LIMITE_BUSCA) {
      throw new Error(`Não foi possível andar ${n} dias úteis a partir de ${dia}.`);
    }
    if (ehUtilNum(atual, cal)) restantes--;
  }
  return paraDia(atual);
}

/**
 * Quantos dias úteis existem entre `inicio` e `fim`, INCLUSIVOS nas duas pontas.
 * Fim antes do início devolve 0. Dia não-útil nas pontas simplesmente não conta.
 */
export function diasUteisEntre(inicio: Dia, fim: Dia, cal: Calendario): number {
  const a = paraNumero(inicio);
  const b = paraNumero(fim);
  if (b < a) return 0;
  if (b - a > LIMITE_BUSCA) {
    throw new Error(`Intervalo grande demais: ${inicio} a ${fim}.`);
  }
  let total = 0;
  for (let n = a; n <= b; n++) if (ehUtilNum(n, cal)) total++;
  return total;
}

/**
 * Converte a duração gravada (`Decimal`, pode ter fração) no número de dias úteis que a
 * barra OCUPA no cronograma. Meio dia de trabalho ainda ocupa um dia no calendário —
 * a fração importa para esforço e custo, não para onde a barra termina.
 *
 * Duração 0 é marco e continua 0: ele não ocupa dia nenhum.
 */
export function diasOcupados(duracaoDias: number): number {
  if (!Number.isFinite(duracaoDias) || duracaoDias < 0) {
    throw new Error(`Duração inválida: ${duracaoDias}.`);
  }
  return duracaoDias === 0 ? 0 : Math.max(1, Math.ceil(duracaoDias));
}

/**
 * Data de término a partir do início e da duração. INCLUSIVA: duração 1 termina no
 * próprio dia de início; duração 5 começando na segunda termina na sexta.
 *
 * Marco (duração 0) termina no dia em que começa.
 */
export function fimPorDuracao(inicio: Dia, duracaoDias: number, cal: Calendario): Dia {
  const ocupados = diasOcupados(duracaoDias);
  const comeco = proximoDiaUtil(inicio, cal);
  return ocupados <= 1 ? comeco : somarDiasUteis(comeco, ocupados - 1, cal);
}

/**
 * Data de início a partir do término e da duração — o passe de volta (backward pass) do
 * CPM. Espelha `fimPorDuracao`: `inicioPorDuracao(fimPorDuracao(d, n), n)` devolve `d`
 * normalizado, e é isso que o teste garante.
 */
export function inicioPorDuracao(fim: Dia, duracaoDias: number, cal: Calendario): Dia {
  const ocupados = diasOcupados(duracaoDias);
  const termino = diaUtilAnterior(fim, cal);
  return ocupados <= 1 ? termino : somarDiasUteis(termino, -(ocupados - 1), cal);
}
