/**
 * Setas de dependência do Gantt, uma para cada tipo de vínculo, com os pontos de ancoragem do MS Project:
 *
 *   FS (TI)  fim da predecessora  → início da sucessora
 *   SS (II)  início              → início
 *   FF (TT)  fim                 → fim
 *   SF (IT)  início              → fim
 *
 * PURO: recebe posições em pixels e devolve o `d` de um `<path>` com segmentos ortogonais (só `M`, `H`, `V`).
 * Quando a sucessora começa "cedo demais" para caber o cotovelo, a seta contorna pela divisa entre as linhas,
 * como o Project, em vez de voltar por cima da própria barra.
 */
import type { TipoVinculo } from "./gantt-linhas";

/** Extremos horizontais da barra e o centro vertical da linha dela. */
export type PosicaoBarra = { xIni: number; xFim: number; y: number };

export const COTOVELO_SETA = 8;

const n = (v: number) => Math.round(v * 100) / 100;

export function caminhoDaSeta(
  tipo: TipoVinculo,
  pred: PosicaoBarra,
  suc: PosicaoBarra,
  alturaLinha: number,
  cotovelo: number = COTOVELO_SETA,
): string {
  const saiPelaDireita = tipo === "fs" || tipo === "ff";
  const entraPeloInicio = tipo === "fs" || tipo === "ss";
  const ax = saiPelaDireita ? pred.xFim : pred.xIni;
  const ay = pred.y;
  const bx = entraPeloInicio ? suc.xIni : suc.xFim;
  const by = suc.y;
  // Divisa entre a linha da predecessora e a próxima na direção da sucessora.
  const divisa = by >= ay ? ay + alturaLinha / 2 : ay - alturaLinha / 2;

  let d: string;
  if (tipo === "fs") {
    const folga = bx - ax;
    if (folga >= 2 * cotovelo) {
      d = `M ${n(ax)} ${n(ay)} H ${n(ax + cotovelo)} V ${n(by)} H ${n(bx)}`;
    } else if (folga >= 4) {
      // Sucessora logo depois (zoom apertado): o cotovelo encolhe para a metade da folga, e a seta ainda chega da esquerda.
      d = `M ${n(ax)} ${n(ay)} H ${n(ax + folga / 2)} V ${n(by)} H ${n(bx)}`;
    } else {
      d = `M ${n(ax)} ${n(ay)} H ${n(ax + cotovelo)} V ${n(divisa)} H ${n(bx - cotovelo)} V ${n(by)} H ${n(bx)}`;
    }
  } else if (tipo === "ss") {
    d = `M ${n(ax)} ${n(ay)} H ${n(Math.min(ax, bx) - cotovelo)} V ${n(by)} H ${n(bx)}`;
  } else if (tipo === "ff") {
    d = `M ${n(ax)} ${n(ay)} H ${n(Math.max(ax, bx) + cotovelo)} V ${n(by)} H ${n(bx)}`;
  } else {
    // sf: sai pela esquerda do início e entra pela direita do fim.
    d =
      ax - cotovelo >= bx + cotovelo
        ? `M ${n(ax)} ${n(ay)} H ${n(ax - cotovelo)} V ${n(by)} H ${n(bx)}`
        : `M ${n(ax)} ${n(ay)} H ${n(ax - cotovelo)} V ${n(divisa)} H ${n(bx + cotovelo)} V ${n(by)} H ${n(bx)}`;
  }
  return d;
}
