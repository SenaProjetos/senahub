/**
 * Cruzamento entre faixas de numeração de disciplinas do catálogo.
 *
 * Por que importa: o reconhecimento de disciplina pelo número do arquivo
 * (`nomenclatura/vocabulario.ts`, `faixaDe`) devolve a PRIMEIRA faixa que contém o número, na
 * ordem do início. Se duas faixas se cruzam, a que começa depois nunca é alcançada na parte
 * compartilhada — ela morre calada, sem erro nenhum. Foi o que o dono notou com Estrutural
 * 4000-4999 e Fundações 4500-4599: a faixa inteira de Fundações ficaria inalcançável.
 *
 * Por isso o cadastro recusa faixa cruzada (decisão do dono, 2026-09-17) em vez de escolher um
 * critério de desempate: o catálogo real usa blocos separados, então cruzamento é engano, não
 * intenção.
 */

export type FaixaDisciplina = {
  nome: string;
  numeracao: number | null;
  numeracaoFim: number | null;
};

type FaixaFechada = { inicio: number; fim: number };

/**
 * Só faixa com as DUAS pontas conta. Disciplina com apenas o início não entra no
 * reconhecimento por número (regra de `montarVocabulario`), então também não pode conflitar —
 * senão o cadastro barraria uma combinação que na prática nunca disputa número nenhum.
 */
function faixaFechada(faixa: { numeracao: number | null; numeracaoFim: number | null }): FaixaFechada | null {
  if (faixa.numeracao === null || faixa.numeracaoFim === null) return null;
  if (faixa.numeracaoFim < faixa.numeracao) return null;
  return { inicio: faixa.numeracao, fim: faixa.numeracaoFim };
}

/** Duas faixas se cruzam quando existe pelo menos um número que cai nas duas. */
export function faixasSeCruzam(
  a: { numeracao: number | null; numeracaoFim: number | null },
  b: { numeracao: number | null; numeracaoFim: number | null },
): boolean {
  const fa = faixaFechada(a);
  const fb = faixaFechada(b);
  if (!fa || !fb) return false;
  return fa.inicio <= fb.fim && fb.inicio <= fa.fim;
}

/**
 * Primeira disciplina de `outras` cuja faixa cruza com `alvo`, ou `null` se a faixa estiver
 * livre. Quem chama já deve ter tirado a própria disciplina da lista (caso de edição).
 */
export function faixaConflitante(
  alvo: { numeracao: number | null; numeracaoFim: number | null },
  outras: FaixaDisciplina[],
): FaixaDisciplina | null {
  if (!faixaFechada(alvo)) return null;
  return outras.find((outra) => faixasSeCruzam(alvo, outra)) ?? null;
}
