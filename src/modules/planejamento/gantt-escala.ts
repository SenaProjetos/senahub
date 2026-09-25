/**
 * Escala de tempo do Gantt no molde do MS Project: um cabeçalho de DOIS níveis (semana sobre dia; mês sobre
 * semana; ano sobre mês), três zooms e as faixas de dia não útil sombreadas.
 *
 * PURO: sem I/O e sem `Date` local. Toda posição sai de `dias × pxPorDia` a partir do início da escala — nunca
 * de uma soma acumulada de larguras, que a 1,6 px/dia deslocaria a barra alguns pixels a cada mês.
 *
 * O calendário (dias úteis e feriados) vem DO SERVIDOR, o mesmo que agenda as linhas: sombrear com um
 * calendário e agendar com outro pintaria a coluna cinza num dia em que a barra começa.
 */
import { diaDaSemana, diasEntre, primeiroDiaDoMes, segundaDaSemana, somarDias, somarMeses, ultimoDiaDoMes } from "@/lib/dias-iso";

export type ZoomGantt = "dias" | "semanas" | "meses";

export const ZOOMS_GANTT: readonly { id: ZoomGantt; rotulo: string }[] = [
  { id: "dias", rotulo: "Dias" },
  { id: "semanas", rotulo: "Semanas" },
  { id: "meses", rotulo: "Meses" },
];

/** Largura de um dia em cada zoom. Em "dias" cabe a inicial do dia da semana; em "meses" cabe o nome do mês. */
export const PX_POR_DIA: Record<ZoomGantt, number> = { dias: 22, semanas: 6, meses: 1.6 };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;
const INICIAIS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

export type FaixaEscala = { chave: string; rotulo: string; titulo: string; x: number; largura: number };
export type FaixaNaoUtil = { x: number; largura: number };

/** Dias da semana que contam (0 = domingo) e feriados (`YYYY-MM-DD`) — o `Calendario` do motor, serializável. */
export type CalendarioGantt = { diasUteis: readonly number[]; feriados: readonly string[] };

export type EscalaGantt = {
  zoom: ZoomGantt;
  pxPorDia: number;
  inicio: string;
  fim: string;
  largura: number;
  /** Nível de cima: semana (em "dias"), mês (em "semanas"), ano (em "meses"). */
  topo: FaixaEscala[];
  /** Nível de baixo: dia, semana ou mês. */
  base: FaixaEscala[];
  /** Fins de semana e feriados, já fundidos em faixas contínuas; vazio em "meses". */
  naoUteis: FaixaNaoUtil[];
  /** Canto esquerdo do dia. */
  x: (dia: string) => number;
  /** Canto direito do dia (o término de uma barra inclui o dia final). */
  xFim: (dia: string) => number;
  contem: (dia: string) => boolean;
};

const dd = (dia: string) => dia.slice(8, 10);
const mes = (dia: string) => MESES[Number(dia.slice(5, 7)) - 1];
const aa = (dia: string) => dia.slice(2, 4);

/**
 * Monta a escala que cobre `min`..`max` (os extremos das barras), com folga para a barra e o rótulo ao lado dela
 * não encostarem na borda. O início é sempre uma segunda-feira (dias, semanas) ou o dia 1 de um mês (meses).
 */
export function montarEscala(p: { min: string; max: string; zoom: ZoomGantt; calendario: CalendarioGantt }): EscalaGantt {
  const { min, max, zoom, calendario } = p;
  const pxPorDia = PX_POR_DIA[zoom];

  let inicio: string;
  let fim: string;
  if (zoom === "dias") {
    inicio = somarDias(segundaDaSemana(min), -7);
    fim = somarDias(segundaDaSemana(max), 6 + 14);
  } else if (zoom === "semanas") {
    inicio = segundaDaSemana(somarDias(min, -14));
    fim = somarDias(segundaDaSemana(somarDias(max, 28)), 6);
  } else {
    inicio = somarMeses(min, -1);
    fim = ultimoDiaDoMes(somarMeses(max, 2));
  }

  const totalDias = diasEntre(inicio, fim) + 1;
  const x = (dia: string) => diasEntre(inicio, dia) * pxPorDia;
  const xFim = (dia: string) => x(dia) + pxPorDia;
  const contem = (dia: string) => dia >= inicio && dia <= fim;

  const topo: FaixaEscala[] = [];
  const base: FaixaEscala[] = [];

  if (zoom === "dias") {
    for (let d = inicio; d <= fim; d = somarDias(d, 7)) {
      topo.push({ chave: d, rotulo: `${dd(d)} ${mes(d)} ${aa(d)}`, titulo: `Semana de ${dd(d)}/${d.slice(5, 7)}/${aa(d)}`, x: x(d), largura: 7 * pxPorDia });
    }
    for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
      base.push({ chave: d, rotulo: INICIAIS_SEMANA[diaDaSemana(d)], titulo: `${dd(d)}/${d.slice(5, 7)}/${aa(d)}`, x: x(d), largura: pxPorDia });
    }
  } else if (zoom === "semanas") {
    for (let m = primeiroDiaDoMes(inicio); m <= fim; m = somarMeses(m, 1)) {
      const ini = m < inicio ? inicio : m;
      const ult = ultimoDiaDoMes(m);
      const f = ult > fim ? fim : ult;
      topo.push({ chave: m, rotulo: `${mes(m)} ${aa(m)}`, titulo: `${mes(m)} de ${m.slice(0, 4)}`, x: x(ini), largura: (diasEntre(ini, f) + 1) * pxPorDia });
    }
    for (let d = inicio; d <= fim; d = somarDias(d, 7)) {
      base.push({ chave: d, rotulo: dd(d), titulo: `Semana de ${dd(d)}/${d.slice(5, 7)}/${aa(d)}`, x: x(d), largura: 7 * pxPorDia });
    }
  } else {
    for (let ano = Number(inicio.slice(0, 4)); ano <= Number(fim.slice(0, 4)); ano++) {
      const ini = `${ano}-01-01` < inicio ? inicio : `${ano}-01-01`;
      const f = `${ano}-12-31` > fim ? fim : `${ano}-12-31`;
      topo.push({ chave: String(ano), rotulo: String(ano), titulo: String(ano), x: x(ini), largura: (diasEntre(ini, f) + 1) * pxPorDia });
    }
    for (let m = inicio; m <= fim; m = somarMeses(m, 1)) {
      const dias = diasEntre(m, ultimoDiaDoMes(m)) + 1;
      base.push({ chave: m, rotulo: mes(m), titulo: `${mes(m)} de ${m.slice(0, 4)}`, x: x(m), largura: dias * pxPorDia });
    }
  }

  // Dia não útil = fora dos dias da semana que contam, ou feriado. Fim de semana + feriado colado viram UMA faixa.
  const naoUteis: FaixaNaoUtil[] = [];
  if (zoom !== "meses") {
    const uteis = new Set(calendario.diasUteis);
    const feriados = new Set(calendario.feriados);
    let corridaDesde: string | null = null;
    const fechar = (ateExclusivo: string) => {
      if (corridaDesde == null) return;
      naoUteis.push({ x: x(corridaDesde), largura: diasEntre(corridaDesde, ateExclusivo) * pxPorDia });
      corridaDesde = null;
    };
    for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
      const naoUtil = !uteis.has(diaDaSemana(d)) || feriados.has(d);
      if (naoUtil) corridaDesde ??= d;
      else fechar(d);
    }
    fechar(somarDias(fim, 1));
  }

  return { zoom, pxPorDia, inicio, fim, largura: totalDias * pxPorDia, topo, base, naoUteis, x, xFim, contem };
}
