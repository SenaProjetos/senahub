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
