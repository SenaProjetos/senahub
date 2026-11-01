/**
 * Perguntas extras do projeto (`InputProjeto`) — regras puras, sem Prisma/React.
 */

export type TemplatePergunta = { id: string; disciplina: string | null; pergunta: string; ordem: number };

/** Pergunta já no projeto — ATIVA OU REMOVIDA: as duas impedem o padrão de recriá-la. */
export type PerguntaExistente = { templateId: string | null; disciplina: string | null; pergunta: string };

const chaveTexto = (disciplina: string | null, pergunta: string) => `${disciplina ?? ""}|${pergunta}`;

/**
 * Perguntas padrão que faltam no projeto: só as gerais e as das disciplinas dele, e nunca uma
 * que já veio do padrão (pelo `templateId`, mesmo editada ou removida) nem uma de mesmo texto
 * e disciplina (linhas anteriores ao `templateId`).
 */
export function perguntasDoPadraoParaCriar(
  templates: readonly TemplatePergunta[],
  existentes: readonly PerguntaExistente[],
  disciplinasDoProjeto: readonly string[],
): TemplatePergunta[] {
  const discs = new Set(disciplinasDoProjeto);
  const jaVeio = new Set(existentes.flatMap((e) => (e.templateId ? [e.templateId] : [])));
  const jaTemTexto = new Set(existentes.map((e) => chaveTexto(e.disciplina, e.pergunta)));
  return templates.filter(
    (t) =>
      (t.disciplina == null || discs.has(t.disciplina)) &&
      !jaVeio.has(t.id) &&
      !jaTemTexto.has(chaveTexto(t.disciplina, t.pergunta)),
  );
}
