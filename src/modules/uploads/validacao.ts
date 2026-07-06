/**
 * Regras puras de validação parcial de entregas (sem I/O, client-safe).
 *
 * "Entregável" = arquivo que precisa estar validado para liberar pagamento/conclusão:
 * pacote A ou B, origem `manual`, considerando apenas a versão mais recente de cada
 * `(pacote, nomeArquivo)` — um reenvio (nova versão) volta a contar como pendente.
 * Ficam de fora RECEBIDOS (insumos do cliente), OUTROS (formato não suportado) e
 * origem `ferramenta` (auto-gerado).
 */

export type UploadValidavel = {
  pacote: "A" | "B" | "OUTROS" | "RECEBIDOS";
  nomeArquivo: string;
  versao: number;
  validado: boolean;
  origem: "manual" | "ferramenta";
};

/** Entregáveis atuais: pacote A|B + origem manual, reduzidos à versão máxima por (pacote, nome). */
export function entregaveisAtuais<T extends UploadValidavel>(uploads: readonly T[]): T[] {
  const atual = new Map<string, T>();
  for (const u of uploads) {
    if (u.origem !== "manual") continue;
    if (u.pacote !== "A" && u.pacote !== "B") continue;
    const chave = `${u.pacote}/${u.nomeArquivo}`;
    const anterior = atual.get(chave);
    if (!anterior || u.versao > anterior.versao) atual.set(chave, u);
  }
  return [...atual.values()];
}

export type StatusValidacao = {
  total: number;
  validados: number;
  pendentes: number;
  todosValidados: boolean;
  /** Pronto para finalizar: todos validados E pacotes obrigatórios presentes. */
  completo: boolean;
};

/** Resumo de progresso da validação de uma disciplina. */
export function statusValidacao(
  uploads: readonly UploadValidavel[],
  opts: { exigePacoteA: boolean; exigePacoteB: boolean },
): StatusValidacao {
  const atuais = entregaveisAtuais(uploads);
  const total = atuais.length;
  const validados = atuais.reduce((n, u) => n + (u.validado ? 1 : 0), 0);
  const pendentes = total - validados;
  const todosValidados = pendentes === 0; // true quando não há entregáveis
  const temA = atuais.some((u) => u.pacote === "A");
  const temB = atuais.some((u) => u.pacote === "B");
  const pacotesOk = (!opts.exigePacoteA || temA) && (!opts.exigePacoteB || temB);
  const completo = pacotesOk && todosValidados;
  return { total, validados, pendentes, todosValidados, completo };
}
