/**
 * Validação de sinônimo — pura, sem I/O. Compartilhada pela edição do catálogo de disciplinas
 * (`modules/projetos/actions.ts`) e da Lista Mestre (`modules/projetos/pranchas/catalogo-actions.ts`):
 * "sinônimo não pode colidir com sigla ou sinônimo de outro item da mesma categoria no mesmo
 * escopo" (F2 da spec do motor de nomenclatura).
 *
 * Colisão é sempre dentro do MESMO escopo (mesma categoria; para `PranchaCatalogo`, também o
 * mesmo projeto ou o global) — quem chama já filtrou `outros` para esse recorte. Cruzar escopos
 * não é erro: `vocabulario.ts` já resolve o projeto vencendo o global para a MESMA parte do nome.
 */

import type { FaixaVersao, SiglaLinha } from "./siglas-versao";

export type ItemComSiglaESinonimos = { id: string; sigla: string; sinonimos: readonly string[] };

/** Maiúscula, sem espaço nas pontas, sem vazio, sem repetir a própria sigla nem duplicata. */
export function normalizarSinonimos(sigla: string, brutos: readonly string[]): string[] {
  const siglaNorm = sigla.trim().toUpperCase();
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bruto of brutos) {
    const norm = bruto.trim().toUpperCase();
    if (!norm || norm === siglaNorm || vistos.has(norm)) continue;
    vistos.add(norm);
    saida.push(norm);
  }
  return saida;
}

/**
 * Item de `outros` (mesmo escopo, sem o próprio) cuja sigla ou sinônimo já é `siglaOuSinonimo`.
 * `null` = sem colisão. Comparação case-insensitive.
 */
export function itemQueColide(
  siglaOuSinonimo: string,
  outros: readonly ItemComSiglaESinonimos[],
): ItemComSiglaESinonimos | null {
  const alvo = siglaOuSinonimo.trim().toUpperCase();
  if (!alvo) return null;
  return (
    outros.find(
      (o) => o.sigla.toUpperCase() === alvo || o.sinonimos.some((s) => s.toUpperCase() === alvo),
    ) ?? null
  );
}

/**
 * Primeira colisão entre a sigla/sinônimos de UM item (o que está sendo salvo) e os `outros`
 * do mesmo escopo. Verifica a própria sigla também: duas disciplinas não podem reaproveitar a
 * sigla uma da outra como sinônimo, nem duas siglas iguais (isso já seria pego pelo `@unique`
 * de `DisciplinaCatalogo.codigo`, mas `PranchaCatalogo.sigla` não tem constraint de banco).
 */
export function primeiraColisao(
  item: { sigla: string; sinonimos: readonly string[] },
  outros: readonly ItemComSiglaESinonimos[],
): { valor: string; comItem: ItemComSiglaESinonimos } | null {
  for (const valor of [item.sigla, ...item.sinonimos]) {
    const comItem = itemQueColide(valor, outros);
    if (comItem) return { valor, comItem };
  }
  return null;
}

export type ItemComSiglasVersionadas = { id: string; siglas: readonly SiglaLinha[] };

/** Duas faixas de versões têm alguma versão em comum? (`versaoAte` null = sem fim.) */
export function faixasSeSobrepoem(a: FaixaVersao, b: FaixaVersao): boolean {
  const fimA = a.versaoAte ?? Number.POSITIVE_INFINITY;
  const fimB = b.versaoAte ?? Number.POSITIVE_INFINITY;
  return a.versaoDesde <= fimB && b.versaoDesde <= fimA;
}

/**
 * Colisão com siglas por versão (D4 da spec de nomenclatura versionada): a mesma sigla só colide
 * quando as faixas de versões se cruzam — `ESG` sinônimo de HID até a v1 e `ESG` sub Esgoto a
 * partir da v2 convivem. Quem chama junta em `outros` tudo que disputa o MESMO lugar no nome:
 * cards e subs entram na mesma lista (ocupam o lugar da disciplina); fase e tipo, cada um na sua
 * categoria e escopo, como em `primeiraColisao`.
 */
export function primeiraColisaoNaVersao(
  item: ItemComSiglasVersionadas,
  outros: readonly ItemComSiglasVersionadas[],
): { sigla: string; comItemId: string } | null {
  for (const linha of item.siglas) {
    const alvo = linha.sigla.trim().toUpperCase();
    if (!alvo) continue;
    for (const outro of outros) {
      if (outro.id === item.id) continue;
      const bate = outro.siglas.some((o) => o.sigla.trim().toUpperCase() === alvo && faixasSeSobrepoem(o, linha));
      if (bate) return { sigla: alvo, comItemId: outro.id };
    }
  }
  return null;
}
