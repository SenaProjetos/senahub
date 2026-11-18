/**
 * "Falta o término real" (2026-11-17): a sucessora de uma tarefa já começou e a tarefa continua sem término real. A
 * célula Térm. real dela fica amarela no Gantt de Controle, com uma data sugerida — quem registra a execução confirma.
 * Puro, sem I/O; a leitura do ponto fica em `queries.ts`. Nada é gravado: o término real conclui a tarefa (100%,
 * fase entregue no marco), e isso continua sendo decisão de quem acompanha o cronograma.
 *
 * Só o vínculo TÉRMINO → INÍCIO conta: é o único que diz "a sucessora só começa depois que esta termina". Com início →
 * início, término → término ou início → término, as duas andam juntas de propósito e a sucessora começar não diz nada.
 *
 * - A sucessora "começou" no dia do início real dela ou da primeira hora apontada nela, o que vier antes. Sucessora
 *   agrupamento começou quando qualquer tarefa de dentro começou.
 * - A tarefa sinalizada é atividade (marco tem uma data só e não recebe hora; agrupamento tem as datas de dentro), sem
 *   término real e ainda em execução — concluída, bloqueada (desbloqueie antes de concluir), suspensa, cancelada e
 *   arquivada ficam de fora.
 * - Sugestão = o ÚLTIMO dia de ponto na tarefa. Sem hora apontada (ou com o último dia antes do início real digitado,
 *   que o término real não aceitaria), não há sugestão: o amarelo aparece sem data.
 * - Mais de uma sucessora começou: vale a que começou primeiro.
 */
type Dia = string;

export type TerminoPendente = {
  /** A sucessora (vínculo término → início) que já começou — a que começou primeiro. */
  sucessoraId: string;
  sucessoraNome: string;
  /** Dia em que a sucessora começou. */
  sucessoraDesde: Dia;
  /** Último dia de ponto nesta tarefa; `null` = não há data para sugerir. */
  sugestao: Dia | null;
};

/** Primeiro e último dia (São Paulo) em que alguém apontou hora na linha, pelo card dela. */
export type PontoDaLinha = { primeiro: Dia; ultimo: Dia };

export type LinhaParaTermino = {
  id: string;
  parentId: string | null;
  nome: string;
  tipoEap: string;
  status: string;
  inicioReal: Dia | null;
  fimReal: Dia | null;
  predecessoras: readonly { predecessoraId: string; tipo: string }[];
};

/** Fora da execução ou já resolvida: não pede término real. */
const SEM_PEDIDO = new Set(["con", "blq", "sus", "can", "arq"]);

const menor = (a: Dia | null, b: Dia | null): Dia | null => (a == null ? b : b == null ? a : a < b ? a : b);

export function terminosPendentes(
  linhas: readonly LinhaParaTermino[],
  ponto: ReadonlyMap<string, PontoDaLinha>,
): Map<string, TerminoPendente> {
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const filhos = new Map<string, string[]>();
  for (const l of linhas) {
    if (l.parentId == null) continue;
    const lista = filhos.get(l.parentId) ?? [];
    lista.push(l.id);
    filhos.set(l.parentId, lista);
  }

  // Dia em que a linha começou (ela ou qualquer uma de dentro). Memória + guarda de ciclo (dado corrompido não estoura).
  const memo = new Map<string, Dia | null>();
  const visitando = new Set<string>();
  const comecou = (id: string): Dia | null => {
    if (memo.has(id)) return memo.get(id) ?? null;
    if (visitando.has(id)) return null;
    visitando.add(id);
    const l = porId.get(id);
    let dia = menor(l?.inicioReal ?? null, ponto.get(id)?.primeiro ?? null);
    for (const f of filhos.get(id) ?? []) dia = menor(dia, comecou(f));
    visitando.delete(id);
    memo.set(id, dia);
    return dia;
  };

  const pendentes = new Map<string, TerminoPendente>();
  for (const sucessora of linhas) {
    for (const v of sucessora.predecessoras) {
      if (v.tipo !== "fs") continue;
      const tarefa = porId.get(v.predecessoraId);
      if (!tarefa || tarefa.fimReal != null || tarefa.tipoEap === "mrc" || SEM_PEDIDO.has(tarefa.status)) continue;
      if ((filhos.get(tarefa.id)?.length ?? 0) > 0) continue;
      const desde = comecou(sucessora.id);
      if (desde == null) continue;
      const atual = pendentes.get(tarefa.id);
      if (atual && atual.sucessoraDesde <= desde) continue;
      const ultimo = ponto.get(tarefa.id)?.ultimo ?? null;
      const sugestao = ultimo != null && (tarefa.inicioReal == null || ultimo >= tarefa.inicioReal) ? ultimo : null;
      pendentes.set(tarefa.id, { sucessoraId: sucessora.id, sucessoraNome: sucessora.nome, sucessoraDesde: desde, sugestao });
    }
  }
  return pendentes;
}
