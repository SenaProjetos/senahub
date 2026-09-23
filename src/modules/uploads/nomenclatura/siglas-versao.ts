/**
 * Siglas por versão do padrão de nomenclatura — puro, client-safe, sem Prisma (D4/D11 da spec
 * `docs/superpowers/specs/2026-09-21-nomenclatura-versionada-subdisciplinas.md`).
 *
 * `SiglaNomenclatura` liga "esta sigla significa este item" por faixa de versões; os itens de
 * catálogo também têm validade própria. Aqui ficam as regras que transformam essas linhas no
 * formato que `montarVocabulario()` já consome (`CatalogosNomenclatura`), para UMA versão — o
 * motor continua sem saber que versões existem.
 */

import type { CatalogosNomenclatura, ItemVocabulario, SubdisciplinaVocabulario } from "./vocabulario";

export type FaixaVersao = { versaoDesde: number; versaoAte: number | null };

export type SiglaLinha = FaixaVersao & { sigla: string; oficial: boolean };

/** A faixa inclui a versão? `versaoAte` null = sem fim. */
export function valeNaVersao(faixa: FaixaVersao, versao: number): boolean {
  return faixa.versaoDesde <= versao && (faixa.versaoAte === null || versao <= faixa.versaoAte);
}

/**
 * Sigla oficial + sinônimos das colunas antigas (`codigo`/`sigla` + `sinonimos`) como linhas da
 * v1 em diante. Mesma normalização da migration `20260922120000_nomenclatura_versionada`
 * (maiúscula, sem espaço nas pontas, sem vazio, sinônimo igual à oficial sai, sem duplicata) —
 * as duas precisam dar o mesmo resultado, senão o espelho das telas diverge do que a migration
 * gravou.
 */
export function siglasDasColunas(oficial: string | null, sinonimos: readonly string[]): SiglaLinha[] {
  const siglaOficial = (oficial ?? "").trim().toUpperCase();
  const linhas: SiglaLinha[] = [];
  if (siglaOficial) linhas.push({ sigla: siglaOficial, oficial: true, versaoDesde: 1, versaoAte: null });
  const vistos = new Set<string>();
  for (const bruto of sinonimos) {
    const sigla = bruto.trim().toUpperCase();
    if (!sigla || sigla === siglaOficial || vistos.has(sigla)) continue;
    vistos.add(sigla);
    linhas.push({ sigla, oficial: false, versaoDesde: 1, versaoAte: null });
  }
  return linhas;
}

/**
 * Sigla oficial e sinônimos de um item numa versão. Mais de uma oficial valendo na mesma
 * versão é cadastro inconsistente (a action barra); aqui vence a de `versaoDesde` mais recente,
 * que é a última decisão tomada — as outras não viram sinônimo, para não inventar leitura.
 */
export function siglasNaVersao(
  linhas: readonly SiglaLinha[],
  versao: number,
): { oficial: string | null; sinonimos: string[] } {
  const validas = linhas.filter((l) => valeNaVersao(l, versao));
  const oficiais = validas.filter((l) => l.oficial).sort((a, b) => b.versaoDesde - a.versaoDesde);
  const oficial = oficiais[0]?.sigla ?? null;
  const sinonimos: string[] = [];
  for (const l of validas) {
    if (l.oficial || l.sigla === oficial || sinonimos.includes(l.sigla)) continue;
    sinonimos.push(l.sigla);
  }
  return { oficial, sinonimos };
}

export type DisciplinaComSiglas = FaixaVersao & {
  id: string;
  numeracao: number | null;
  numeracaoFim: number | null;
  siglas: readonly SiglaLinha[];
};

export type SubdisciplinaComSiglas = FaixaVersao & {
  id: string;
  disciplinaCatalogoId: string;
  siglas: readonly SiglaLinha[];
};

export type PranchaComSiglas = FaixaVersao & {
  id: string;
  categoria: "fase" | "tipo" | "folha";
  projetoId: string | null;
  siglas: readonly SiglaLinha[];
};

/**
 * Catálogos de UMA versão, no formato de `montarVocabulario()`. Item fora da versão não entra;
 * item sem sigla oficial na versão também não (sem sigla não há o que reconhecer no nome, e o
 * gerador de nome não teria o que escrever) — exceto o card que tem sub válida na versão: ele
 * entra com `codigo` null, para as subs terem a quem apontar (card de v2 sem sigla "geral").
 * Folha fica de fora: o motor não lê tamanho de papel pelo nome.
 *
 * Quem chama já filtrou `ativo` e o escopo de projeto (global + o do próprio projeto), como
 * `carregarCatalogosNomenclatura` faz hoje.
 */
export function catalogosDaVersao(
  entrada: {
    disciplinas: readonly DisciplinaComSiglas[];
    subdisciplinas?: readonly SubdisciplinaComSiglas[];
    pranchas: readonly PranchaComSiglas[];
  },
  versao: number,
): CatalogosNomenclatura {
  const cardsNaVersao = new Set(entrada.disciplinas.filter((d) => valeNaVersao(d, versao)).map((d) => d.id));
  const subdisciplinas: SubdisciplinaVocabulario[] = (entrada.subdisciplinas ?? [])
    .filter((sub) => cardsNaVersao.has(sub.disciplinaCatalogoId) && valeNaVersao(sub, versao))
    .map((sub) => ({ sub, siglas: siglasNaVersao(sub.siglas, versao) }))
    .filter(({ siglas }) => siglas.oficial !== null)
    .map(({ sub, siglas }) => ({
      id: sub.id,
      sigla: siglas.oficial as string,
      sinonimos: siglas.sinonimos,
      disciplinaId: sub.disciplinaCatalogoId,
    }));
  const cardsComSub = new Set(subdisciplinas.map((sub) => sub.disciplinaId));

  const disciplinas = entrada.disciplinas
    .filter((d) => cardsNaVersao.has(d.id))
    .map((d) => ({ d, siglas: siglasNaVersao(d.siglas, versao) }))
    .filter(({ d, siglas }) => siglas.oficial !== null || cardsComSub.has(d.id))
    .map(({ d, siglas }) => ({
      id: d.id,
      codigo: siglas.oficial,
      numeracao: d.numeracao,
      numeracaoFim: d.numeracaoFim,
      sinonimos: siglas.sinonimos,
    }));

  const itens = (categoria: "fase" | "tipo"): ItemVocabulario[] =>
    entrada.pranchas
      .filter((p) => p.categoria === categoria && valeNaVersao(p, versao))
      .map((p) => ({ p, siglas: siglasNaVersao(p.siglas, versao) }))
      .filter(({ siglas }) => siglas.oficial !== null)
      .map(({ p, siglas }) => ({
        id: p.id,
        sigla: siglas.oficial as string,
        sinonimos: siglas.sinonimos,
        projetoId: p.projetoId,
      }));

  return { disciplinas, subdisciplinas, fases: itens("fase"), tipos: itens("tipo") };
}
