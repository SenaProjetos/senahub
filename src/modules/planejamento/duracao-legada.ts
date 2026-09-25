import { diasUteisEntre, type Calendario, type Dia } from "@/lib/calendario-trabalho";

/**
 * Duração herdada da F0 em DIAS CORRIDOS → dias úteis.
 *
 * A migration da F0 preencheu `duracaoDias` com `(fim − início) + 1` — dias corridos, a conta do CPM
 * antigo. O motor lê a duração como dias ÚTEIS: sem converter, a primeira vez que o projeto é
 * reagendado toda linha estica ~40% (um mês corrido vira quase um mês e meio útil), e as datas que o
 * time digitou somem. A conversão preserva o que estava nas datas: a linha passa a durar os dias úteis
 * que já cobria.
 *
 * PURO. Só converte quando a duração gravada É a de dias corridos (o valor que a F0 deixou): linha
 * que alguém já editou em dias úteis tem outro número e fica como está — é o que torna o script
 * idempotente e seguro de rodar de novo.
 */

export type LinhaDuracaoLegada = {
  tipoEap: string;
  /** Tem filhas: a duração é derivada, não se converte. */
  ehResumo: boolean;
  duracaoDias: number;
  inicio: Dia;
  fim: Dia;
};

const MS_DIA = 86_400_000;

function diasCorridos(inicio: Dia, fim: Dia): number {
  const a = Date.UTC(Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7)) - 1, Number(inicio.slice(8, 10)));
  const b = Date.UTC(Number(fim.slice(0, 4)), Number(fim.slice(5, 7)) - 1, Number(fim.slice(8, 10)));
  return Math.max(Math.round((b - a) / MS_DIA) + 1, 1);
}

/** A duração em dias úteis que a linha deve passar a ter, ou `null` quando não há o que converter. */
export function duracaoConvertida(l: LinhaDuracaoLegada, cal: Calendario): number | null {
  if (l.ehResumo || l.tipoEap === "mrc" || l.duracaoDias <= 0) return null;
  if (l.duracaoDias !== diasCorridos(l.inicio, l.fim)) return null;
  const uteis = Math.max(1, diasUteisEntre(l.inicio, l.fim, cal));
  return uteis === l.duracaoDias ? null : uteis;
}
