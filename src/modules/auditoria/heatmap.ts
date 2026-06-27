/**
 * Heatmap de uso por seção (módulo) a partir dos eventos de auditoria.
 * Puro/testável: recebe os eventos e devolve a matriz seção × dia + totais.
 * Sem dependências de Prisma/Next — a query passa apenas { modulo, em }.
 */

export type EventoUso = { modulo: string; em: Date };

export type HeatmapUso = {
  /** Módulos (seções) ordenados por total desc, limitado a topN. */
  modulos: { modulo: string; total: number }[];
  /** Dias da janela em ISO (yyyy-mm-dd), do mais antigo ao mais recente. */
  dias: string[];
  /** Contagens [índice do módulo][índice do dia]. */
  matriz: number[][];
  /** Maior valor de célula (para a escala de cor). */
  max: number;
  /** Soma de todos os eventos dentro da janela. */
  totalGeral: number;
};

function diaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function montarHeatmap(
  eventos: EventoUso[],
  opts: { dias: number; hoje: Date; topN?: number },
): HeatmapUso {
  const nDias = Math.max(1, opts.dias);
  const topN = opts.topN ?? 12;

  // Janela de dias (mais antigo → mais recente).
  const dias: string[] = [];
  for (let i = nDias - 1; i >= 0; i--) {
    const d = new Date(opts.hoje);
    d.setDate(opts.hoje.getDate() - i);
    dias.push(diaISO(d));
  }
  const indiceDia = new Map(dias.map((d, i) => [d, i]));

  const totais = new Map<string, number>();
  const porModulo = new Map<string, number[]>();
  for (const e of eventos) {
    const di = indiceDia.get(diaISO(e.em));
    if (di === undefined) continue; // fora da janela
    totais.set(e.modulo, (totais.get(e.modulo) ?? 0) + 1);
    let linha = porModulo.get(e.modulo);
    if (!linha) {
      linha = new Array(nDias).fill(0);
      porModulo.set(e.modulo, linha);
    }
    linha[di] += 1;
  }

  const modulos = [...totais.entries()]
    .map(([modulo, total]) => ({ modulo, total }))
    .sort((a, b) => b.total - a.total || a.modulo.localeCompare(b.modulo))
    .slice(0, topN);

  const matriz = modulos.map(({ modulo }) => porModulo.get(modulo) ?? new Array<number>(nDias).fill(0));
  let max = 0;
  for (const linha of matriz) for (const v of linha) if (v > max) max = v;
  const totalGeral = [...totais.values()].reduce((a, b) => a + b, 0);

  return { modulos, dias, matriz, max, totalGeral };
}
