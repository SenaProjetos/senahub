/**
 * "O que mudou desde sua última análise" (item 8) — puro, sem I/O, no molde de `prazo.ts`.
 *
 * **Dois sinais separados, nunca somados** (decidido com o conselho): apontamento novo e revisão
 * nova são coisas diferentes pra quem abre a prancha. "3 novidades" que na verdade são 1 revisão
 * e 2 apontamentos faz a pessoa procurar 3 pinos e não achar. A frase diz cada um pelo nome.
 *
 * O corte é a última ABERTURA da prancha (`LeituraDocumento.lidoEm`), e "nunca abriu" não é
 * "tudo é novo": numa prancha com 40 apontamentos históricos, anunciar 40 novidades pra quem
 * chegou agora seria ruído. Primeira visita não tem novidade — tem a prancha inteira.
 */

export type Novidades = {
  /** `null` = primeira visita (não há marca d'água anterior). */
  desde: string | null;
  /** Apontamentos PUBLICADOS depois do corte (rascunho não conta — ninguém mais os vê). */
  apontamentos: number;
  /** Revisões (versões novas do documento) subidas depois do corte. */
  revisoes: number;
};

/** Há algo a anunciar? Primeira visita nunca tem. */
export function temNovidade(n: Novidades): boolean {
  return n.desde !== null && (n.apontamentos > 0 || n.revisoes > 0);
}

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/**
 * Frase pt-BR do aviso, ou `null` quando não há o que dizer. Os dois sinais aparecem lado a
 * lado, nunca fundidos num total.
 */
export function descreverNovidades(n: Novidades): string | null {
  if (!temNovidade(n)) return null;
  const partes: string[] = [];
  if (n.revisoes > 0) partes.push(plural(n.revisoes, "revisão nova", "revisões novas"));
  if (n.apontamentos > 0) partes.push(plural(n.apontamentos, "apontamento novo", "apontamentos novos"));
  return `Desde sua última visita: ${partes.join(" e ")}.`;
}
