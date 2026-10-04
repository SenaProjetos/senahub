import { extensao } from "@/modules/uploads/destino";

/**
 * Ordem única dos arquivos de um mesmo documento/revisão na tela: PDF, depois DWG, depois as
 * demais extensões em ordem alfabética (empate pelo nome). O banco devolve os uploads da
 * revisão sem ordem garantida — sem isto o par PDF/DWG trocava de lugar de um documento pro
 * outro e confundia quem procura o botão pela posição.
 */
const PRIORIDADE: Record<string, number> = { pdf: 0, dwg: 1 };

export function ordenarPorFormato<T>(arquivos: readonly T[], nomeDe: (arquivo: T) => string): T[] {
  return [...arquivos].sort((a, b) => {
    const na = nomeDe(a);
    const nb = nomeDe(b);
    const ea = extensao(na);
    const eb = extensao(nb);
    const pa = PRIORIDADE[ea] ?? 2;
    const pb = PRIORIDADE[eb] ?? 2;
    if (pa !== pb) return pa - pb;
    return ea.localeCompare(eb) || na.localeCompare(nb);
  });
}
