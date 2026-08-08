/**
 * Comparador do arnês de audiência (§6.2 passo 4 do plano de Setor × Contratação × Perfil).
 * Puro — sem I/O, sem Prisma — para rodar com fixtures sintéticas e sem banco.
 *
 * **Simétrico, ao contrário de `equivalencia-permissoes.ts` — e a diferença é proposital.**
 * Lá, perder acesso é warning: degrada o serviço e se conserta com um override, com a pessoa
 * reclamando no mesmo dia. Aqui os dois lados são irrecuperáveis depois do fato:
 *   - **saiu** da audiência = R2, a falha silenciosa. A aprovação não notifica, o alerta de
 *     certidão some, o digest chega vazio. Não gera erro, não gera log, ninguém percebe por
 *     semanas — e a notificação que não foi enviada não volta.
 *   - **entrou** na audiência = a notificação vazou para fora do conjunto pretendido. Quem
 *     leu, leu.
 * Por isso qualquer diferença é falha dura. Mudança intencional passa por allowlist versionada,
 * mesmo rito do R1.
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.2, §7-R2)
 */

/** Um conjunto de ids nomeado: uma audiência, ou o menu visível de um usuário. */
export type ConjuntoNomeado = {
  /** Chave estável da audiência, ou o id (hasheado) do usuário no caso do menu. */
  chave: string;
  ids: string[];
};

export type DiferencaConjunto = {
  chave: string;
  /** Ids presentes depois e ausentes antes — vazamento de destinatário. */
  entraram: string[];
  /** Ids presentes antes e ausentes depois — R2, a falha silenciosa. */
  sairam: string[];
};

function normalizar(cs: ConjuntoNomeado[]): Map<string, Set<string>> {
  return new Map(cs.map((c) => [c.chave, new Set(c.ids)]));
}

/**
 * Compara dois snapshots de conjuntos nomeados. Uma chave presente em `antes` e ausente em
 * `depois` conta como conjunto VAZIO (todos saíram) — audiência que sumiu do código é
 * exatamente o desaparecimento silencioso que o R2 descreve, não um dado faltando. Uma chave
 * nova em `depois` conta como conjunto vazio antes (todos entraram).
 */
export function compararConjuntos(antes: ConjuntoNomeado[], depois: ConjuntoNomeado[]): DiferencaConjunto[] {
  const mapaAntes = normalizar(antes);
  const mapaDepois = normalizar(depois);
  const chaves = [...new Set([...mapaAntes.keys(), ...mapaDepois.keys()])].sort();

  const diffs: DiferencaConjunto[] = [];
  for (const chave of chaves) {
    const a = mapaAntes.get(chave) ?? new Set<string>();
    const d = mapaDepois.get(chave) ?? new Set<string>();
    const entraram = [...d].filter((id) => !a.has(id)).sort();
    const sairam = [...a].filter((id) => !d.has(id)).sort();
    if (entraram.length || sairam.length) diffs.push({ chave, entraram, sairam });
  }
  return diffs;
}

/**
 * Audiências que resolveram para conjunto vazio. É o assert de runtime que o R2 pede: uma
 * audiência vazia quase nunca é intencional, e é indistinguível de "funcionou" para quem só
 * olha se a ação deu erro.
 */
export function conjuntosVazios(cs: ConjuntoNomeado[]): string[] {
  return cs.filter((c) => c.ids.length === 0).map((c) => c.chave).sort();
}
