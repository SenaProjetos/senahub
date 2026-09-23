/**
 * Trava de publicação de uma versão do padrão de nomenclatura — pura, sem I/O (D5 da spec
 * `docs/superpowers/specs/2026-09-21-nomenclatura-versionada-subdisciplinas.md`).
 *
 * D4 permite (e prevê) que a mesma sigla mude de significado entre versões — não é bug, é o
 * caso do `ESG` (sinônimo de HID na v1, sub Esgoto na v2). O que esta trava faz é só AVISAR
 * quem publica, antes de tornar a mudança definitiva: "essas siglas já significaram outra
 * coisa numa versão anterior publicada — confirma?". Nunca bloqueia (D5: "não bloqueia").
 */

export type LinhaSigla = {
  sigla: string;
  categoria: string;
  oficial: boolean;
  versaoDesde: number;
  versaoAte: number | null;
  /** Chave estável do alvo (ex.: `disciplina:d-hid`, `subdisciplina:s-esg`). */
  alvoChave: string;
  /** Rótulo legível do alvo, para a mensagem ("Hidrossanitário", "Esgoto (sub)"). */
  alvoRotulo: string;
};

export type Redefinicao = {
  sigla: string;
  categoria: string;
  /** Alvo que a sigla tinha numa versão publicada ANTERIOR à que está sendo publicada. */
  alvoAntigo: { rotulo: string; desdeVersao: number };
  /** Alvo que a sigla passa a ter na versão sendo publicada. */
  alvoNovo: { rotulo: string };
};

/**
 * Siglas OFICIAIS que, na versão `versaoAlvo`, apontam para um alvo diferente do que apontavam
 * em alguma versão publicada anterior (`versoesPublicadasAnteriores`, os números já publicados
 * e menores que `versaoAlvo`). Sinônimo não conta sozinho como "significado oficial", mas se um
 * sinônimo de uma versão anterior virou oficial de OUTRO alvo, isso também é redefinição (é
 * exatamente o caso do ESG: sinônimo de HID na v1, oficial de Esgoto na v2).
 */
export function siglasRedefinidas(
  todasAsLinhas: readonly LinhaSigla[],
  versaoAlvo: number,
  versoesPublicadasAnteriores: readonly number[],
): Redefinicao[] {
  const anteriores = new Set(versoesPublicadasAnteriores.filter((v) => v < versaoAlvo));
  if (anteriores.size === 0) return [];

  // Agrupa só pela SIGLA (texto), não pela categoria: a categoria do alvo é justamente o que
  // pode mudar numa redefinição (ESG era sinônimo de uma DISCIPLINA e virou oficial de uma
  // SUBDISCIPLINA) — agrupar por categoria também esconderia esse caso do outro lado da conta.
  const porSigla = new Map<string, LinhaSigla[]>();
  for (const linha of todasAsLinhas) {
    const chave = linha.sigla.toUpperCase();
    const lista = porSigla.get(chave);
    if (lista) lista.push(linha);
    else porSigla.set(chave, [linha]);
  }

  const alvoNaVersao = (linhas: LinhaSigla[], versao: number) =>
    linhas.find((l) => l.versaoDesde <= versao && (l.versaoAte === null || versao <= l.versaoAte));

  // Compara só com a versão publicada anterior MAIS RECENTE: se ESG já virou Esgoto na v2, e a
  // v3 mantém ESG=Esgoto, publicar a v3 não repete o aviso — a mudança de verdade foi na v2.
  const versaoAnterior = Math.max(...anteriores);

  const redefinicoes: Redefinicao[] = [];
  for (const linhas of porSigla.values()) {
    const novo = linhas.find((l) => l.oficial && l.versaoDesde <= versaoAlvo && (l.versaoAte === null || versaoAlvo <= l.versaoAte));
    const antigo = novo ? alvoNaVersao(linhas, versaoAnterior) : undefined;
    if (!novo || !antigo || antigo.alvoChave === novo.alvoChave) continue;
    redefinicoes.push({
      sigla: novo.sigla,
      categoria: novo.categoria,
      alvoAntigo: { rotulo: antigo.alvoRotulo, desdeVersao: antigo.versaoDesde },
      alvoNovo: { rotulo: novo.alvoRotulo },
    });
  }
  return redefinicoes.sort((a, b) => a.sigla.localeCompare(b.sigla));
}
