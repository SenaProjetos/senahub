/**
 * Recesso em período — regras puras (sem I/O). Um recesso vira UM `Feriado` por dia, com
 * `tipo = "recesso"`, para que ponto, escala, banco de horas e cronograma não precisem mudar:
 * todos já leem o calendário de feriados dia a dia.
 *
 * Recesso NÃO é feriado legal. Por isso fica fora de duas contas que seguem a lei, e não a
 * empresa: o "Nº dia útil" dos vencimentos (salário, art. 459 §1º da CLT) e o início de férias
 * CLT (art. 134 §3º) — ver `semRecesso`.
 */

export const TIPO_RECESSO = "recesso";

/** Teto de um período de recesso, em dias corridos. Evita um clique errado de anos. */
export const MAX_DIAS_RECESSO = 62;

const MS_DIA = 86_400_000;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

function paraNumero(dia: string): number | null {
  if (!RE_DIA.test(dia)) return null;
  const t = Date.parse(`${dia}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const n = Math.round(t / MS_DIA);
  return paraDia(n) === dia ? n : null;
}

function paraDia(n: number): string {
  return new Date(n * MS_DIA).toISOString().slice(0, 10);
}

/** Motivo para recusar o período, ou `null` se ele vale. Mesma frase na tela e no servidor. */
export function motivoPeriodoInvalido(inicio: string, fim: string): string | null {
  const a = paraNumero(inicio);
  const b = paraNumero(fim);
  if (a === null || b === null) return "Informe as datas de início e fim do recesso.";
  if (b < a) return "A data final do recesso não pode ser antes da inicial.";
  if (b - a + 1 > MAX_DIAS_RECESSO) return `O recesso pode ter no máximo ${MAX_DIAS_RECESSO} dias.`;
  return null;
}

/** Todos os dias de `inicio` a `fim`, inclusive, em `YYYY-MM-DD`. Supõe período válido. */
export function diasDoPeriodo(inicio: string, fim: string): string[] {
  const a = paraNumero(inicio);
  const b = paraNumero(fim);
  if (a === null || b === null || b < a) return [];
  const dias: string[] = [];
  for (let n = a; n <= b; n++) dias.push(paraDia(n));
  return dias;
}

/**
 * Os dias do período que viram recesso: os que ainda não têm feriado. Um dia já ocupado (Natal,
 * feriado municipal, recorrente) fica como está — o recesso nunca apaga nem renomeia outro feriado.
 * `recorrentes` são os pares `MM-DD` dos feriados que repetem todo ano.
 */
export function diasLivresDoRecesso(
  inicio: string,
  fim: string,
  ocupados: ReadonlySet<string>,
  recorrentes: ReadonlySet<string>,
): string[] {
  return diasDoPeriodo(inicio, fim).filter((d) => !ocupados.has(d) && !recorrentes.has(d.slice(5)));
}

/** Tira o recesso de uma lista de feriados — para as contas que seguem o feriado LEGAL. */
export function semRecesso<T extends { tipo: string }>(feriados: readonly T[]): T[] {
  return feriados.filter((f) => f.tipo !== TIPO_RECESSO);
}

type Dia = { id: string; data: string; nome: string; tipo: string; origem: "unico" | "recorrente" };

export type LinhaFeriado<T extends Dia> =
  | { tipo: "dia"; feriado: T }
  | { tipo: "recesso"; nome: string; inicio: string; fim: string; ids: string[] };

/**
 * Lista da tela: junta os dias de recesso de mesmo nome numa linha só ("23/12 a 02/01"). Dois dias
 * de recesso continuam na mesma linha quando tudo o que há entre eles já é feriado — o Natal no meio
 * do recesso não parte a linha em duas; ele aparece na própria linha, como sempre.
 * `feriados` em ordem de data.
 */
export function agruparRecessos<T extends Dia>(feriados: readonly T[]): LinhaFeriado<T>[] {
  const datas = new Set(feriados.map((f) => f.data));
  const linhas: LinhaFeriado<T>[] = [];
  let aberto: Extract<LinhaFeriado<T>, { tipo: "recesso" }> | null = null;

  const continua = (de: string, ate: string) => {
    for (const d of diasDoPeriodo(de, ate).slice(1, -1)) if (!datas.has(d)) return false;
    return true;
  };

  for (const f of feriados) {
    if (f.tipo !== TIPO_RECESSO || f.origem !== "unico") {
      linhas.push({ tipo: "dia", feriado: f });
      continue;
    }
    if (aberto && aberto.nome === f.nome && continua(aberto.fim, f.data)) {
      aberto.fim = f.data;
      aberto.ids.push(f.id);
      continue;
    }
    aberto = { tipo: "recesso", nome: f.nome, inicio: f.data, fim: f.data, ids: [f.id] };
    linhas.push(aberto);
  }
  return linhas;
}
