/**
 * "Aplicar ao projeto": o que a EAP grava de prazo em cada disciplina e em cada etapa (F4).
 *
 * PURO: sem I/O. Existe fora da action porque é a única das quatro escritas de prazo com
 * lógica de verdade — máximo por alvo, casamento de fase, linhas puladas — e lógica assim só
 * é confiável com teste, que numa action exigiria sessão.
 */

export type LinhaEap = { disciplinaId: string; etapaId: string | null; fimPrevisto: Date };
export type DisciplinaAlvo = {
  id: string;
  nome: string;
  /** Etapas da disciplina: `id` da DisciplinaEtapa e a fase (`etapaId`) que ela representa. */
  etapas: { id: string; etapaId: string }[];
};

export type PlanoAplicacao = {
  /** Prazo direto na disciplina — só para disciplina SEM etapa. */
  porDisciplina: Map<string, Date>;
  /** Prazo na etapa (chave: id da DisciplinaEtapa). */
  porEtapa: Map<string, Date>;
  /** Disciplinas com etapa que receberam prazo e precisam reconsolidar. */
  aReconsolidar: Set<string>;
  /** Linhas que não viraram prazo, deduplicadas, em português para a tela. */
  ignoradas: string[];
};

const maior = (a: Date | undefined, b: Date) => (a && a > b ? a : b);

/**
 * O MAIOR fim previsto por alvo — é o que a prévia da tela promete. A versão anterior gravava
 * linha a linha e a última escrita vencia: com duas linhas na mesma disciplina, o prazo
 * gravado dependia da ordem em que o banco devolvia as linhas, não do plano.
 *
 * Disciplina com etapa só recebe prazo de linha que tenha a MESMA fase de uma etapa dela.
 * Linha sem fase, ou de fase que a disciplina não tem, é pulada e reportada: adivinhar a
 * etapa seria inventar prazo, e criar a etapa sozinho contraria a regra de que nada cria
 * etapa sem o coordenador.
 */
export function planejarAplicacao(linhas: readonly LinhaEap[], disciplinas: readonly DisciplinaAlvo[]): PlanoAplicacao {
  const porDisciplina = new Map<string, Date>();
  const porEtapa = new Map<string, Date>();
  const aReconsolidar = new Set<string>();
  const ignoradas = new Set<string>();

  for (const d of disciplinas) {
    const minhas = linhas.filter((l) => l.disciplinaId === d.id);
    if (minhas.length === 0) continue;

    if (d.etapas.length === 0) {
      for (const l of minhas) porDisciplina.set(d.id, maior(porDisciplina.get(d.id), l.fimPrevisto));
      continue;
    }

    const etapaPorFase = new Map(d.etapas.map((e) => [e.etapaId, e.id]));
    for (const l of minhas) {
      const alvo = l.etapaId ? etapaPorFase.get(l.etapaId) : undefined;
      if (!alvo) {
        ignoradas.add(
          l.etapaId ? `${d.nome}: linha de uma fase que a disciplina não tem` : `${d.nome}: linha sem fase`,
        );
        continue;
      }
      porEtapa.set(alvo, maior(porEtapa.get(alvo), l.fimPrevisto));
      aReconsolidar.add(d.id);
    }
  }

  return { porDisciplina, porEtapa, aReconsolidar, ignoradas: [...ignoradas] };
}
