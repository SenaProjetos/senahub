/**
 * Helpers de construção de MemoriaDoc + disclaimer padrão (decisão #4 do design).
 * Puro / client-safe.
 */

import type { MemoriaDoc, MemoriaSecao } from "./types";

export * from "./types";

/** Aviso fixo de responsabilidade técnica no rodapé de toda memória. */
export const DISCLAIMER_PADRAO =
  "Memória gerada por ferramenta de apoio do SenaHub. Os resultados devem ser conferidos pelo " +
  "engenheiro responsável, a quem cabe a responsabilidade técnica (ART/RRT).";

type MontarBaseArgs = {
  ferramenta: string;
  titulo: string;
  subtitulo?: string;
  norma?: string;
  autor?: string;
  projeto?: string;
  secoes: MemoriaSecao[];
  geradoEm?: string;
};

/** Monta um MemoriaDoc com disclaimer padrão e data atual (se não informada). */
export function montarMemoriaBase(args: MontarBaseArgs): MemoriaDoc {
  return {
    ferramenta: args.ferramenta,
    titulo: args.titulo,
    subtitulo: args.subtitulo,
    norma: args.norma,
    geradoEm: args.geradoEm ?? new Date().toISOString(),
    autor: args.autor,
    projeto: args.projeto,
    secoes: args.secoes,
    disclaimer: DISCLAIMER_PADRAO,
  };
}

/** Formata um número para a memória: até `casas` decimais, sem zeros supérfluos, separador pt-BR opcional. */
export function fmtNum(n: number, casas = 2): string {
  if (!Number.isFinite(n)) return "—";
  const fixed = n.toFixed(casas);
  const limpo = fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
  return limpo === "-0" ? "0" : limpo;
}
