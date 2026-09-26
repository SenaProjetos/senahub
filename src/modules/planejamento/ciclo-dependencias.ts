/**
 * Um conjunto novo de predecessoras de UMA linha cria ciclo? (A depende de B que depende de A.)
 *
 * PURO. Recebe as dependências que já existem no projeto, tira as que a linha tinha e põe as novas, e segue as
 * predecessoras a partir de cada nova: se algum caminho volta à linha, o vínculo fecharia um ciclo. Serve à
 * edição da célula Predecessoras, que troca o conjunto inteiro de uma vez: um vínculo que a linha já tinha e vai
 * sair do texto não pode bloquear o novo (`c ← b` trocado por `c ← a`), e checar contra o banco atual o bloquearia.
 */
export type Aresta = { tarefaId: string; predecessoraId: string };

export function criaCiclo(existentes: readonly Aresta[], tarefaId: string, novasPredecessoras: readonly string[]): boolean {
  // Predecessoras de cada linha, com as da linha editada já trocadas pelas novas.
  const predsDe = new Map<string, string[]>();
  for (const a of existentes) {
    if (a.tarefaId === tarefaId) continue;
    const l = predsDe.get(a.tarefaId);
    if (l) l.push(a.predecessoraId);
    else predsDe.set(a.tarefaId, [a.predecessoraId]);
  }
  predsDe.set(tarefaId, [...novasPredecessoras]);

  const visitados = new Set<string>();
  let fronteira = [...novasPredecessoras];
  while (fronteira.length > 0) {
    if (fronteira.includes(tarefaId)) return true;
    const proxima: string[] = [];
    for (const id of fronteira) {
      if (visitados.has(id)) continue;
      visitados.add(id);
      proxima.push(...(predsDe.get(id) ?? []));
    }
    fronteira = proxima;
  }
  return false;
}
