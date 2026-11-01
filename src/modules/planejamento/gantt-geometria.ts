/**
 * Geometria vertical das barras de UMA linha do Gantt — pura, sem React nem I/O, para o desenho
 * (`components/planejamento/gantt-barra.tsx`) e o teste lerem os mesmos números.
 *
 * Planejamento: uma barra de 14 px, centrada (como sempre foi). Controle (decisão de 29/10/2026, opção B):
 * duas barras de 9 px empilhadas — execução em cima, linha de base embaixo — com 2 px entre elas e folga igual
 * acima e abaixo. A espessura é a MESMA em toda linha, tenha ela base ou não (a faixa da base fica vazia nas
 * linhas criadas depois da aprovação), para o gráfico não alternar 9/14 px de uma linha para outra.
 */

export type ModoBarra = "planejamento" | "controle";

export type GeometriaDaBarra = {
  execTop: number;
  execAltura: number;
  /** `null` fora do controle: lá não há barra de base. */
  baseTop: number | null;
  baseAltura: number | null;
};

const ALTURA_PLANEJAMENTO = 14;
const ALTURA_CONTROLE = 9;
const ENTRE_BARRAS = 2;

export function geometriaDasBarras(modo: ModoBarra, rowH: number): GeometriaDaBarra {
  if (modo === "planejamento") {
    return { execTop: Math.round((rowH - ALTURA_PLANEJAMENTO) / 2), execAltura: ALTURA_PLANEJAMENTO, baseTop: null, baseAltura: null };
  }
  const execTop = Math.floor((rowH - (2 * ALTURA_CONTROLE + ENTRE_BARRAS)) / 2);
  return {
    execTop,
    execAltura: ALTURA_CONTROLE,
    baseTop: execTop + ALTURA_CONTROLE + ENTRE_BARRAS,
    baseAltura: ALTURA_CONTROLE,
  };
}

export type GeometriaDoAgrupamento = {
  /** Barra preta do agrupamento. */
  barraTop: number;
  barraAltura: number;
  /** Triângulos das pontas, logo abaixo da barra (a altura é a da borda superior do triângulo). */
  pontaTop: number;
  pontaAltura: number;
};

/**
 * O agrupamento: barra preta com as pontas. No planejamento, o desenho de sempre (barra em 8, pontas em 14).
 * No controle ele se encaixa na faixa da execução (4–13 para linha de 28) e não invade a faixa da base.
 */
export function geometriaDoAgrupamento(modo: ModoBarra, rowH: number): GeometriaDoAgrupamento {
  if (modo === "planejamento") return { barraTop: 8, barraAltura: 6, pontaTop: 14, pontaAltura: 6 };
  const { execTop, execAltura } = geometriaDasBarras("controle", rowH);
  const barraAltura = 4;
  return { barraTop: execTop, barraAltura, pontaTop: execTop + barraAltura, pontaAltura: execAltura - barraAltura };
}
