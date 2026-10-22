/**
 * Disciplina da linha da EAP em relação ao agrupamento onde ela está — PURO, sem I/O.
 *
 * A1: linha NOVA nasce com a disciplina do agrupamento-pai, nunca com a da linha vizinha. "Inserir acima" de uma
 * linha de Hidro criava a linha em Hidro, com o responsável de Hidro (D22) e, com o cronograma aprovado, um card
 * para essa pessoa — foi assim que "Visita técnica" apareceu como Hidro no 260035.
 *
 * A2: mover e recuar NÃO trocam a disciplina (trocar mexe em responsável, card e pagamento). Quem aponta a
 * divergência é o verificador de qualidade, e o botão de correção usa esta mesma regra.
 */

export type PaiDaLinha = { disciplinaId: string | null; etapaId: string | null };

/** Disciplina e fase com que uma linha NOVA nasce, dado o agrupamento-pai (`null` = raiz). */
export function disciplinaParaLinhaNova(pai: PaiDaLinha | null): { disciplinaId: string | null; etapaId: string | null } {
  if (!pai?.disciplinaId) return { disciplinaId: null, etapaId: null };
  // Fase sem disciplina é recusada (`faseDaLinha`): a fase só acompanha quando há disciplina.
  return { disciplinaId: pai.disciplinaId, etapaId: pai.etapaId };
}

export type NoDisciplina = { id: string; parentId: string | null; disciplinaId: string | null; etapaId: string | null };

export type Divergencia = {
  tarefaId: string;
  atualId: string;
  /** Disciplina do ancestral mais próximo que tem uma. */
  esperadaId: string;
  /** Fase desse ancestral (pode ser `null`). */
  etapaEsperadaId: string | null;
};

/**
 * Linhas com disciplina diferente da do ancestral mais próximo COM disciplina. Linha sem disciplina nunca é
 * achado (pode ser proposital), nem linha sem ancestral com disciplina. Ciclo de `parentId` não acusa; `parentId`
 * que aponta para fora da lista vale como raiz. Ordem de entrada.
 */
export function divergenciasDeDisciplina(nos: readonly NoDisciplina[]): Divergencia[] {
  const porId = new Map(nos.map((n) => [n.id, n]));
  const out: Divergencia[] = [];
  for (const n of nos) {
    if (!n.disciplinaId) continue;
    // Sobe até a raiz: ciclo (revisitou alguém) = estrutura inválida, o verificador de ciclos cuida — aqui não acusa.
    const vistos = new Set<string>([n.id]);
    let esperadaId: string | null = null;
    let etapaEsperadaId: string | null = null;
    let ciclo = false;
    for (let atual = n.parentId ? porId.get(n.parentId) : undefined; atual; atual = atual.parentId ? porId.get(atual.parentId) : undefined) {
      if (vistos.has(atual.id)) {
        ciclo = true;
        break;
      }
      vistos.add(atual.id);
      if (!esperadaId && atual.disciplinaId) {
        esperadaId = atual.disciplinaId;
        etapaEsperadaId = atual.etapaId;
      }
    }
    if (ciclo || !esperadaId) continue;
    if (esperadaId !== n.disciplinaId) out.push({ tarefaId: n.id, atualId: n.disciplinaId, esperadaId, etapaEsperadaId });
  }
  return out;
}
