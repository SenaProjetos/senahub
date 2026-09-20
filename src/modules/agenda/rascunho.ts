/**
 * Valores iniciais do diálogo "Novo compromisso" — **puro**. Vêm de três lugares: o botão do topo
 * (vazio), o menu de um dia ("Novo compromisso neste dia") e o menu de um compromisso
 * ("Duplicar"). Datas no formato do `<input type="datetime-local">`: "YYYY-MM-DDTHH:mm", em
 * horário local.
 */

export type RascunhoCompromisso = {
  titulo: string;
  local: string;
  inicio: string;
  fim: string;
  participantesIds: string[];
};

/** Hora em que um compromisso criado a partir de um dia começa (o dia inteiro não tem hora). */
export const HORA_PADRAO = 9;
export const DURACAO_PADRAO_MIN = 60;

export const RASCUNHO_VAZIO: RascunhoCompromisso = {
  titulo: "",
  local: "",
  inicio: "",
  fim: "",
  participantesIds: [],
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Data local no formato do `<input type="datetime-local">`. */
export function paraLocalDT(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Soma minutos a um valor de datetime-local; "" quando a entrada ainda está incompleta. */
export function somarMinutosDT(valor: string, minutos: number): string {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() + minutos);
  return paraLocalDT(d);
}

/** Duração em minutos entre dois valores de datetime-local (null se algum for inválido). */
export function minutosEntreDT(inicio: string, fim: string): number | null {
  const a = new Date(inicio);
  const b = new Date(fim);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

/** "Novo compromisso neste dia": 09:00–10:00 do dia clicado. */
export function rascunhoDeDia(dia: Date): RascunhoCompromisso {
  const inicio = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), HORA_PADRAO, 0);
  const inicioDT = paraLocalDT(inicio);
  return { ...RASCUNHO_VAZIO, inicio: inicioDT, fim: somarMinutosDT(inicioDT, DURACAO_PADRAO_MIN) };
}

/**
 * "Duplicar": mesmos título, local, horário e convidados. O próprio usuário sai da lista de
 * convidados — a action o inclui sozinha, e ele não aparece entre as pessoas escolhíveis.
 */
export function rascunhoDeDuplicata(
  c: { titulo: string; local: string | null; inicio: string; fim: string | null; participantesIds: string[] },
  meId: string,
): RascunhoCompromisso {
  return {
    titulo: c.titulo,
    local: c.local ?? "",
    inicio: paraLocalDT(new Date(c.inicio)),
    fim: c.fim ? paraLocalDT(new Date(c.fim)) : "",
    participantesIds: c.participantesIds.filter((id) => id !== meId),
  };
}

/**
 * Duração que o fim acompanha enquanto o usuário não o edita: a do rascunho quando ele traz um
 * fim válido (duplicata), a padrão de 1 h quando não.
 */
export function duracaoDoRascunho(r: Pick<RascunhoCompromisso, "inicio" | "fim">): number {
  const d = r.inicio && r.fim ? minutosEntreDT(r.inicio, r.fim) : null;
  return d !== null && d > 0 ? d : DURACAO_PADRAO_MIN;
}
