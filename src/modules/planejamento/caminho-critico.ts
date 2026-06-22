/**
 * Caminho crítico (CPM) para a EAP.
 *
 * Helper PURO (sem I/O, sem dependências de React/Prisma) — testável isoladamente.
 *
 * Cada tarefa tem início/fim previstos (datas ISO `YYYY-MM-DD`) e uma lista de
 * predecessoras (relações Fim→Início / FS). A partir das datas previstas
 * derivamos a DURAÇÃO de cada tarefa (em dias de calendário, inclusiva) e
 * rodamos o algoritmo clássico:
 *
 *   forward pass  → early start (ES) / early finish (EF)
 *   backward pass → late finish (LF) / late start (LS)
 *   folga (slack) = LS − ES  (== LF − EF)
 *   tarefa crítica ⇔ folga 0
 *
 * Observações / aproximações (documentadas conforme pedido):
 * - Trabalhamos em dias de calendário (sem calendário de trabalho/feriados).
 * - A DURAÇÃO vem das datas previstas informadas, não das datas; portanto o ES
 *   calculado pelo CPM pode divergir do `inicioPrevisto` real quando o
 *   cronograma informado não respeita as dependências. Isso é esperado: o CPM
 *   reposiciona as tarefas a partir das dependências para achar a folga teórica.
 * - Relação suportada: Fim→Início (FS) com lag 0, que é o único tipo de
 *   dependência modelado no schema (EapDependencia.predecessoraId).
 * - Tarefas-pai/resumo (com filhos) também entram no grafo como tarefas comuns;
 *   o schema não distingue resumo de folha para fins de dependência.
 * - Ciclos: já são impedidos na criação de dependências (ver actions), mas o
 *   algoritmo é defensivo (usa ordenação topológica e ignora arestas que
 *   fechariam ciclo, evitando loop infinito).
 */

export type TarefaCPM = {
  id: string;
  /** Data ISO `YYYY-MM-DD`. */
  inicioPrevisto: string;
  /** Data ISO `YYYY-MM-DD`. */
  fimPrevisto: string;
  /** IDs das tarefas predecessoras (relação Fim→Início). */
  predecessoraIds: string[];
};

export type ResultadoCPM = {
  /** IDs das tarefas críticas (folga 0). */
  criticas: Set<string>;
  /** Folga (em dias) por id de tarefa. */
  folgaPorId: Map<string, number>;
};

const MS_DIA = 86_400_000;

const parseDia = (iso: string) => new Date(iso + "T00:00:00").getTime();

/** Duração em dias de calendário (inclusiva): 1 dia mínimo. */
function duracaoDias(t: TarefaCPM): number {
  const ini = parseDia(t.inicioPrevisto);
  const fim = parseDia(t.fimPrevisto);
  const dias = Math.round((fim - ini) / MS_DIA) + 1;
  return dias > 0 ? dias : 1;
}

/**
 * Calcula o caminho crítico de um conjunto de tarefas com dependências FS.
 * Retorna o Set de ids críticos e o mapa de folgas.
 */
export function calcularCaminhoCritico(tarefas: TarefaCPM[]): ResultadoCPM {
  const vazio: ResultadoCPM = { criticas: new Set(), folgaPorId: new Map() };
  if (tarefas.length === 0) return vazio;

  const ids = new Set(tarefas.map((t) => t.id));
  const dur = new Map<string, number>();
  // Predecessoras válidas (ignora ids que não existem no conjunto).
  const preds = new Map<string, string[]>();
  const sucs = new Map<string, string[]>();
  for (const t of tarefas) {
    dur.set(t.id, duracaoDias(t));
    preds.set(t.id, []);
    sucs.set(t.id, []);
  }
  for (const t of tarefas) {
    for (const p of t.predecessoraIds) {
      if (!ids.has(p) || p === t.id) continue;
      preds.get(t.id)!.push(p);
      sucs.get(p)!.push(t.id);
    }
  }

  // Ordenação topológica (Kahn). Defensiva contra ciclos: se sobrar nó, anexa
  // os restantes na ordem de entrada para não travar.
  const grauEntrada = new Map<string, number>();
  for (const t of tarefas) grauEntrada.set(t.id, preds.get(t.id)!.length);
  const fila: string[] = [];
  for (const t of tarefas) if (grauEntrada.get(t.id) === 0) fila.push(t.id);
  const ordem: string[] = [];
  while (fila.length > 0) {
    const id = fila.shift()!;
    ordem.push(id);
    for (const s of sucs.get(id)!) {
      grauEntrada.set(s, grauEntrada.get(s)! - 1);
      if (grauEntrada.get(s) === 0) fila.push(s);
    }
  }
  if (ordem.length < tarefas.length) {
    const vistos = new Set(ordem);
    for (const t of tarefas) if (!vistos.has(t.id)) ordem.push(t.id);
  }

  // Forward pass: early start / early finish.
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of ordem) {
    const inicio = Math.max(0, ...preds.get(id)!.map((p) => ef.get(p) ?? 0));
    es.set(id, inicio);
    ef.set(id, inicio + dur.get(id)!);
  }

  // Duração total do projeto.
  const fimProjeto = Math.max(...ordem.map((id) => ef.get(id)!));

  // Backward pass: late finish / late start.
  const lf = new Map<string, number>();
  const ls = new Map<string, number>();
  for (let i = ordem.length - 1; i >= 0; i--) {
    const id = ordem[i];
    const sucessores = sucs.get(id)!;
    const fim = sucessores.length
      ? Math.min(...sucessores.map((s) => ls.get(s) ?? fimProjeto))
      : fimProjeto;
    lf.set(id, fim);
    ls.set(id, fim - dur.get(id)!);
  }

  // Folga e criticidade.
  const folgaPorId = new Map<string, number>();
  const criticas = new Set<string>();
  for (const t of tarefas) {
    const folga = (ls.get(t.id) ?? 0) - (es.get(t.id) ?? 0);
    folgaPorId.set(t.id, folga);
    if (folga <= 0) criticas.add(t.id);
  }

  return { criticas, folgaPorId };
}

const parseDiaUTC = (iso: string) => Date.parse(iso + "T00:00:00Z");
const toISODia = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Reagenda as tarefas pelas dependências FS (forward pass), preservando a duração
 * de cada uma. A sucessora passa a iniciar no dia seguinte ao maior fim das
 * predecessoras; tarefas sem predecessora mantêm o início atual (âncora).
 * Retorna apenas as tarefas cuja data mudou. Datas ISO `YYYY-MM-DD`.
 */
export function reagendarPorDependencias(
  tarefas: TarefaCPM[],
): Map<string, { inicioPrevisto: string; fimPrevisto: string }> {
  const mudancas = new Map<string, { inicioPrevisto: string; fimPrevisto: string }>();
  if (tarefas.length === 0) return mudancas;

  const ids = new Set(tarefas.map((t) => t.id));
  const preds = new Map<string, string[]>();
  const sucs = new Map<string, string[]>();
  const durMs = new Map<string, number>(); // (duração-1) em ms — para preservar a duração
  const inicioOrig = new Map<string, number>();
  for (const t of tarefas) {
    preds.set(t.id, []);
    sucs.set(t.id, []);
    durMs.set(t.id, (duracaoDias(t) - 1) * MS_DIA);
    inicioOrig.set(t.id, parseDiaUTC(t.inicioPrevisto));
  }
  for (const t of tarefas) {
    for (const p of t.predecessoraIds) {
      if (!ids.has(p) || p === t.id) continue;
      preds.get(t.id)!.push(p);
      sucs.get(p)!.push(t.id);
    }
  }

  // Ordenação topológica (Kahn), defensiva contra ciclos.
  const grau = new Map<string, number>();
  for (const t of tarefas) grau.set(t.id, preds.get(t.id)!.length);
  const fila: string[] = [];
  for (const t of tarefas) if (grau.get(t.id) === 0) fila.push(t.id);
  const ordem: string[] = [];
  while (fila.length > 0) {
    const id = fila.shift()!;
    ordem.push(id);
    for (const s of sucs.get(id)!) {
      grau.set(s, grau.get(s)! - 1);
      if (grau.get(s) === 0) fila.push(s);
    }
  }
  if (ordem.length < tarefas.length) {
    const vistos = new Set(ordem);
    for (const t of tarefas) if (!vistos.has(t.id)) ordem.push(t.id);
  }

  const novoFim = new Map<string, number>();
  for (const id of ordem) {
    const ps = preds.get(id)!;
    const inicio = ps.length === 0 ? inicioOrig.get(id)! : Math.max(...ps.map((p) => novoFim.get(p)! + MS_DIA));
    const fim = inicio + durMs.get(id)!;
    novoFim.set(id, fim);
    if (inicio !== inicioOrig.get(id)!) {
      mudancas.set(id, { inicioPrevisto: toISODia(inicio), fimPrevisto: toISODia(fim) });
    }
  }
  return mudancas;
}
