/**
 * Siglas que os geradores de nome escrevem, NA VERSÃO do padrão do projeto — puro, client-safe
 * (F3 da spec `docs/superpowers/specs/2026-09-21-nomenclatura-versionada-subdisciplinas.md`).
 *
 * As telas guardam as siglas das colunas antigas (`PranchaCatalogo.sigla`, `DisciplinaCatalogo.codigo`),
 * que são as da v1. Num projeto v2 o nome corrigido tem de sair com `BAS`, não `BS` — então a
 * sigla vem do vocabulário da versão, que já foi montado para o motor.
 */

import type { CatalogosNomenclatura, Vocabulario } from "./vocabulario";

export type OpcaoSigla = { id: string; sigla: string; nome: string };

/**
 * Opções de fase ou tipo com a sigla da versão. Item sem sigla na versão sai da lista (não dá
 * para escrever no nome, e escolher algo que o padrão do projeto não reconhece só cria nome
 * "fora do padrão").
 */
export function opcoesNaVersao(
  itens: readonly OpcaoSigla[],
  vocabulario: Vocabulario,
  categoria: "fase" | "tipo",
): OpcaoSigla[] {
  return itens.flatMap((item) => {
    const sigla = vocabulario.siglaDe(categoria, item.id);
    return sigla ? [{ ...item, sigla }] : [];
  });
}

/**
 * Sigla geral do card na versão. Card fora do vocabulário (disciplina de projeto ainda sem FK
 * para o catálogo) mantém a sigla que a tela já tinha — é o comportamento de antes. Card da
 * versão sem sigla geral (Telecom na v2, identificado só pelas subs) devolve `null`: o nome
 * precisa de uma sub.
 */
export function siglaDoCardNaVersao(
  disciplina: { catalogoId: string | null; sigla: string | null },
  catalogos: CatalogosNomenclatura,
  vocabulario: Vocabulario,
): string | null {
  const noCatalogo = disciplina.catalogoId && catalogos.disciplinas.some((d) => d.id === disciplina.catalogoId);
  if (!noCatalogo) return disciplina.sigla;
  return vocabulario.siglaDe("disciplina", disciplina.catalogoId as string);
}

/** Subs do card na versão, na ordem do catálogo. */
export function subsDoCard(
  catalogoId: string | null,
  catalogos: CatalogosNomenclatura,
): { id: string; sigla: string }[] {
  if (!catalogoId) return [];
  return (catalogos.subdisciplinas ?? [])
    .filter((sub) => sub.disciplinaId === catalogoId)
    .map((sub) => ({ id: sub.id, sigla: sub.sigla }));
}

/** Sigla que ocupa o lugar da disciplina no nome: a da sub, se houver; senão, a geral do card. */
export function siglaNoLugarDaDisciplina(
  card: { sigla: string | null; subdisciplinas?: readonly { id: string; sigla: string }[] },
  subdisciplinaId: string | null | undefined,
): string | null {
  const sub = subdisciplinaId ? card.subdisciplinas?.find((s) => s.id === subdisciplinaId) : undefined;
  return sub?.sigla ?? card.sigla;
}
