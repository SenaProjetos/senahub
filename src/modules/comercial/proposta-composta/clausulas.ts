/**
 * Escolha da cláusula da biblioteca para uma seção da proposta — puro, sem I/O.
 *
 * A biblioteca guarda variantes: por **disciplina** (o escopo de estrutural não é o de elétrica) e
 * por **UF** (norma de incêndio, concessionária). Esta regra decide qual vale para uma proposta.
 *
 * Existe por causa de um erro real: as duas propostas de Milagres/AL citavam o COSCIP de
 * Pernambuco como norma de PCI — parágrafo copiado de proposta de PE. A regra que evita isso é
 * "**variante de outra UF nunca é escolhida**": ou a UF da obra tem variante própria, ou vale a
 * genérica, ou não há cláusula (e a seção fica vazia para a gestão preencher) — nunca a de PE.
 */

export type ClausulaCandidata = {
  id: string;
  /** Seção da proposta (DESCRICAO, ESCOPO, NAO_INCLUSO…). */
  secao: string;
  /** Escopo por disciplina; `null`/ausente = vale para a seção inteira. */
  disciplinaId?: string | null;
  /** Variante por estado; `null`/ausente = genérica (vale em qualquer UF). */
  uf?: string | null;
  ordem: number;
  ativo: boolean;
};

const normalizarUf = (uf: string | null | undefined): string | null => {
  const u = uf?.trim().toUpperCase();
  return u ? u : null;
};

/**
 * Escolhe a cláusula que vale para (`secao`, `disciplinaId`, `uf`), ou `undefined`.
 *
 * Elegível = ativa, da seção, e cada dimensão **combina exatamente ou é genérica**:
 * - disciplina: a da cláusula é a pedida, ou a cláusula não tem disciplina;
 * - UF: a da cláusula é a da obra, ou a cláusula não tem UF.
 * Uma cláusula específica de OUTRA disciplina ou de OUTRA UF nunca é elegível.
 *
 * Entre as elegíveis ganha a mais específica. Quando as duas dimensões puxam para lados
 * diferentes (uma cláusula da disciplina, genérica em UF, contra uma da UF, genérica em
 * disciplina), **a disciplina pesa mais**: é o assunto do texto; a UF só ajusta a norma citada.
 * Persistindo o empate, vale a menor `ordem` e, por último, o `id` — resultado determinístico.
 *
 * Sem `disciplinaId` na chamada só valem cláusulas sem disciplina: a cláusula de escopo de uma
 * disciplina não entra numa seção geral.
 */
export function escolherClausula<T extends ClausulaCandidata>(
  candidatas: readonly T[],
  secao: string,
  disciplinaId: string | null | undefined,
  uf: string | null | undefined,
): T | undefined {
  const ufObra = normalizarUf(uf);
  const disciplina = disciplinaId ?? null;

  const elegiveis = candidatas.filter((c) => {
    if (!c.ativo || c.secao !== secao) return false;
    const disciplinaDaClausula = c.disciplinaId ?? null;
    if (disciplinaDaClausula !== null && disciplinaDaClausula !== disciplina) return false;
    const ufDaClausula = normalizarUf(c.uf);
    if (ufDaClausula !== null && ufDaClausula !== ufObra) return false;
    return true;
  });

  // Especificidade: disciplina exata (2) pesa mais que UF exata (1).
  const peso = (c: T) => ((c.disciplinaId ?? null) !== null ? 2 : 0) + (normalizarUf(c.uf) !== null ? 1 : 0);

  return [...elegiveis].sort((a, b) => peso(b) - peso(a) || a.ordem - b.ordem || a.id.localeCompare(b.id))[0];
}
