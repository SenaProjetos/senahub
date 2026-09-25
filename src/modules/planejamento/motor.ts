/**
 * Motor de agendamento da EAP — o coração do cronograma.
 *
 * PURO: sem I/O, sem Prisma, sem React. Recebe as linhas prontas e devolve datas, folga e
 * caminho crítico. Quem lê o banco é o adaptador; aqui só entra `number` e `string`
 * (o `Decimal` do Prisma é convertido na fronteira — `Decimal` em conta de motor vira
 * string concatenada sem ninguém notar).
 *
 * INVERTE O CPM ANTIGO (`caminho-critico.ts`, removido nesta fase): ele deduzia a DURAÇÃO
 * das datas digitadas e contava
 * dias corridos; aqui a duração + o calendário + as dependências GERAM as datas. É
 * substituição, não evolução — as duas coisas não podem coexistir sem o cronograma passar
 * a ter duas respostas para "quando isso termina".
 *
 * Cobre o que o Doc 03 §12-§13 e §18 pedem:
 *   - 4 tipos de vínculo (FS, SS, FF, SF) com lag em dias úteis, positivo ou negativo
 *   - 6 restrições de data, incluindo as que PUXAM uma linha para trás
 *   - folga total e folga livre
 *   - caminho crítico por folga zero
 *   - rollup de resumo: pai deriva do filho, nunca o contrário (Doc 03 §8)
 *
 * E o realizado (L1 — D6, "atraso real empurra as sucessoras"), como o "Atualizar projeto" do MS
 * Project:
 *   - concluída fica nas datas reais; iniciada começa no início real — a realidade atropela o vínculo;
 *   - com Data de Status, o trabalho NÃO FEITO vai para o dia útil seguinte a ela ("Reprogramar trabalho
 *     não concluído para iniciar após"): a parte feita de uma iniciada fica onde está e o restante
 *     (duração × (1 − %)) anda; a não iniciada que devia ter começado anda inteira;
 *   - percentual sem data real segue o Project: > 0% conta como iniciada no início calculado, 100% como
 *     concluída nas datas calculadas.
 * A linha de base não é tocada: ela é o combinado, e o desvio aparece justamente contra ela.
 */
import {
  type Calendario,
  type Dia,
  diaUtilAnterior,
  diaUtilApos,
  diasOcupados,
  diasUteisEntre,
  fimPorDuracao,
  inicioPorDuracao,
  proximoDiaUtil,
  somarDiasUteis,
} from "@/lib/calendario-trabalho";

export type TipoVinculo = "fs" | "ss" | "ff" | "sf";

export type Restricao =
  | "iniciar_em"
  | "iniciar_nao_antes_de"
  | "iniciar_nao_depois_de"
  | "terminar_em"
  | "terminar_nao_antes_de"
  | "terminar_nao_depois_de";

export type Vinculo = {
  /** Id da linha PREDECESSORA. */
  predecessoraId: string;
  tipo: TipoVinculo;
  /** Defasagem em dias úteis. Negativo antecipa (Doc 03 §13). */
  lagDias: number;
};

export type LinhaEntrada = {
  id: string;
  /** Id do pai na árvore, ou null na raiz. */
  parentId: string | null;
  /** Dias ÚTEIS. 0 = marco. Linha-resumo ignora este valor: ela deriva dos filhos. */
  duracaoDias: number;
  predecessoras: Vinculo[];
  restricaoTipo?: Restricao | null;
  restricaoData?: Dia | null;
  /**
   * Horas previstas da linha (soma das atribuições, D23) — peso do rollup de progresso
   * (D26). `null`/ausente = AINDA NÃO ESTIMADA; `0` = estimada como zero (etapa de
   * terceiro: "aprovação na prefeitura" leva 45 dias e zero hora da casa). A diferença
   * decide o rollup — ver `aplicarProgresso`. Em linha-resumo é ignorado: soma dos filhos.
   */
  trabalhoHoras?: number | null;
  /** Progresso informado (0-100). Em linha-resumo é ignorado: o motor calcula. */
  progresso?: number;
  /** Início real (L1). Com ele a linha deixa de seguir as dependências e as restrições. */
  inicioReal?: Dia | null;
  /** Término real (L1): a linha está concluída nestas datas. */
  fimReal?: Dia | null;
};

/** Onde a linha está na execução, pelo realizado (ou pelo %, na regra do MS Project). */
export type SituacaoExecucao = "nao_iniciada" | "em_andamento" | "concluida";

export type OpcoesAgenda = {
  /**
   * Data de Status do projeto (Doc 03 §21). Com ela, trabalho não feito que cairia até esta data vai
   * para o dia útil seguinte — ninguém trabalha no passado. Sem ela, nada é reprogramado.
   */
  dataStatus?: Dia | null;
};

export type LinhaAgendada = {
  id: string;
  inicio: Dia;
  fim: Dia;
  /** Dias úteis que a linha ocupa, já com a duração de resumo derivada dos filhos. */
  duracaoDias: number;
  /** Folga total: quanto pode atrasar sem mover o término do projeto. */
  folgaTotal: number;
  /** Folga livre: quanto pode atrasar sem mover NENHUMA sucessora. */
  folgaLivre: number;
  critica: boolean;
  /** Progresso — informado na folha, ponderado por horas no resumo. */
  progresso: number;
  /**
   * Horas previstas: o informado na folha; no resumo, a soma dos filhos. `null` quando
   * alguma folha abaixo não foi estimada — somar só as estimadas daria um total que
   * parece completo e não é (é o que a baseline grava e o Valor Agregado lê).
   */
  trabalhoHoras: number | null;
  /** `true` quando a restrição impediu o motor de respeitar uma dependência. */
  conflitoRestricao: boolean;
  ehResumo: boolean;
  /** Pelo realizado. No resumo, `nao_iniciada` (o resumo não tem execução própria). */
  situacao: SituacaoExecucao;
  /** A Data de Status empurrou o trabalho não feito desta linha para depois dela. */
  reprogramada: boolean;
};

export type ResultadoMotor = {
  linhas: Map<string, LinhaAgendada>;
  /** Ids no caminho crítico, folga zero. */
  criticas: Set<string>;
  /** Término do projeto: o maior fim entre todas as linhas. `null` se não houver linha. */
  fimProjeto: Dia | null;
  /**
   * Arestas que foram IGNORADAS por fecharem ciclo. Vazio é o normal — a action impede
   * criar ciclo, mas o motor é defensivo porque um dado ruim não pode travar o servidor.
   */
  ciclosIgnorados: { tarefaId: string; predecessoraId: string }[];
};

/** Quem são os filhos de cada linha. Linha com filho é resumo e não tem duração própria. */
function indexarFilhos(linhas: LinhaEntrada[]): Map<string, string[]> {
  const filhos = new Map<string, string[]>();
  for (const l of linhas) {
    if (l.parentId == null) continue;
    const lista = filhos.get(l.parentId);
    if (lista) lista.push(l.id);
    else filhos.set(l.parentId, [l.id]);
  }
  return filhos;
}

/**
 * Ordem topológica pelas dependências, com detecção de ciclo (Kahn).
 *
 * Aresta que fecharia ciclo é DESCARTADA e reportada, em vez de lançar: o motor roda em
 * tela e um dado inconsistente tem de virar aviso, não página de erro.
 */
function ordenar(
  linhas: LinhaEntrada[],
  ativa: Map<string, Vinculo[]>,
): { ordem: string[]; ignorados: { tarefaId: string; predecessoraId: string }[] } {
  const grau = new Map<string, number>();
  const saida = new Map<string, string[]>();
  for (const l of linhas) grau.set(l.id, 0);

  for (const l of linhas) {
    for (const v of ativa.get(l.id) ?? []) {
      if (!grau.has(v.predecessoraId)) continue; // predecessora fora do conjunto: ignora
      grau.set(l.id, (grau.get(l.id) ?? 0) + 1);
      const s = saida.get(v.predecessoraId);
      if (s) s.push(l.id);
      else saida.set(v.predecessoraId, [l.id]);
    }
  }

  const fila = linhas.filter((l) => (grau.get(l.id) ?? 0) === 0).map((l) => l.id);
  const ordem: string[] = [];
  while (fila.length > 0) {
    const id = fila.shift()!;
    ordem.push(id);
    for (const suc of saida.get(id) ?? []) {
      const g = (grau.get(suc) ?? 0) - 1;
      grau.set(suc, g);
      if (g === 0) fila.push(suc);
    }
  }

  const ignorados: { tarefaId: string; predecessoraId: string }[] = [];
  if (ordem.length < linhas.length) {
    // Sobrou gente: está em ciclo. Entram na ordem como estavam e as arestas de volta
    // (para quem ainda não foi ordenado) são descartadas.
    const jaOrdenado = new Set(ordem);
    for (const l of linhas) {
      if (jaOrdenado.has(l.id)) continue;
      for (const v of ativa.get(l.id) ?? []) {
        if (!jaOrdenado.has(v.predecessoraId) && grau.has(v.predecessoraId)) {
          ignorados.push({ tarefaId: l.id, predecessoraId: v.predecessoraId });
        }
      }
      ordem.push(l.id);
      jaOrdenado.add(l.id);
    }
  }
  return { ordem, ignorados };
}

/** Desloca um dia por `lag` dias úteis (0 devolve o próprio dia normalizado). */
function aplicarLag(dia: Dia, lag: number, cal: Calendario): Dia {
  if (lag === 0) return dia;
  return somarDiasUteis(dia, Math.trunc(lag), cal);
}

/**
 * Início mais cedo que uma dependência permite.
 *
 * FS/SS devolvem restrição de INÍCIO direto. FF/SF restringem o TÉRMINO, então o início é
 * derivado de volta pela duração — é por isso que o motor precisa da duração aqui e não
 * pode tratar os 4 tipos como variações de FS.
 */
function inicioMinimoPor(
  v: Vinculo,
  pred: { inicio: Dia; fim: Dia },
  duracaoDias: number,
  cal: Calendario,
): Dia {
  switch (v.tipo) {
    case "fs": {
      // MARCO cai no MESMO DIA em que a predecessora termina; tarefa real começa no dia
      // útil seguinte. Não é caso especial inventado: o MS Project agenda em horas, e a
      // sucessora começa no instante em que a predecessora acaba (17:00 do dia 12). Um
      // marco tem duração zero e é desenhado nesse instante, no dia 12; uma tarefa real
      // só tem sua primeira hora útil às 8:00 do dia 13.
      // Conferido três vezes no EAP.pdf do escritório (linhas 26, 33 e 105), e a linha 28
      // confirma o outro lado: tarefa de 1 dia depois do marco de 12/10 começa em 13/10.
      const base = diasOcupados(duracaoDias) === 0 ? pred.fim : somarDiasUteis(pred.fim, 1, cal);
      return aplicarLag(base, v.lagDias, cal);
    }
    case "ss":
      return aplicarLag(pred.inicio, v.lagDias, cal);
    case "ff": {
      const fimMin = aplicarLag(pred.fim, v.lagDias, cal);
      return inicioPorDuracao(fimMin, duracaoDias, cal);
    }
    case "sf": {
      // Término da sucessora não pode ser antes do início da predecessora.
      const fimMin = aplicarLag(pred.inicio, v.lagDias, cal);
      return inicioPorDuracao(fimMin, duracaoDias, cal);
    }
  }
}

/** Restrições que PRENDEM a data — empurrar a linha para além delas é conflito, não ajuste. */
const RESTRICAO_RIGIDA = new Set<Restricao>(["iniciar_em", "iniciar_nao_depois_de", "terminar_em", "terminar_nao_depois_de"]);

/**
 * Situação da linha pelo realizado. Percentual sem data real segue o MS Project: informar % > 0 grava
 * o início real no início agendado, e 100% grava o término real no término agendado — aqui isso não é
 * gravado, só lido assim. É o que evita que uma linha com 40% informado e sem data real vá inteira
 * para depois da Data de Status, como se nada tivesse sido feito.
 */
function situacaoDe(l: LinhaEntrada): SituacaoExecucao {
  if (l.fimReal || (l.progresso ?? 0) >= 100) return "concluida";
  if (l.inicioReal || (l.progresso ?? 0) > 0) return "em_andamento";
  return "nao_iniciada";
}

/** Aplica a restrição ao início já calculado. Devolve o início e se houve conflito. */
function aplicarRestricao(
  inicioCalculado: Dia,
  linha: LinhaEntrada,
  cal: Calendario,
): { inicio: Dia; conflito: boolean } {
  const tipo = linha.restricaoTipo;
  const data = linha.restricaoData;
  if (!tipo || !data) return { inicio: inicioCalculado, conflito: false };

  const dur = linha.duracaoDias;
  switch (tipo) {
    case "iniciar_em":
      return { inicio: proximoDiaUtil(data, cal), conflito: proximoDiaUtil(data, cal) < inicioCalculado };
    case "iniciar_nao_antes_de": {
      const piso = proximoDiaUtil(data, cal);
      return { inicio: piso > inicioCalculado ? piso : inicioCalculado, conflito: false };
    }
    case "iniciar_nao_depois_de": {
      const teto = proximoDiaUtil(data, cal);
      // A restrição PUXA a linha para trás e, ao fazê-lo, pode violar a dependência —
      // é exatamente o conflito que a tela precisa mostrar em vez de esconder.
      return { inicio: teto < inicioCalculado ? teto : inicioCalculado, conflito: teto < inicioCalculado };
    }
    case "terminar_em": {
      const ini = inicioPorDuracao(diaUtilAnterior(data, cal), dur, cal);
      return { inicio: ini, conflito: ini < inicioCalculado };
    }
    case "terminar_nao_antes_de": {
      const piso = inicioPorDuracao(diaUtilAnterior(data, cal), dur, cal);
      return { inicio: piso > inicioCalculado ? piso : inicioCalculado, conflito: false };
    }
    case "terminar_nao_depois_de": {
      const teto = inicioPorDuracao(diaUtilAnterior(data, cal), dur, cal);
      return { inicio: teto < inicioCalculado ? teto : inicioCalculado, conflito: teto < inicioCalculado };
    }
  }
}

/**
 * Agenda a EAP inteira.
 *
 * `inicioProjeto` é a âncora: linha sem predecessora e sem restrição começa aí. Sem âncora
 * o motor não teria de onde partir, e cair em "hoje" faria o cronograma de um projeto já
 * aprovado andar sozinho a cada dia que passa.
 *
 * A âncora é um PISO, como no MS Project agendando "a partir da data de início do projeto":
 * nenhuma linha começa antes dela. Isso importa para SF e para lag negativo, que pedem uma
 * data anterior — eles ficam presos na âncora em vez de empurrar o projeto para trás. Quem
 * precisa da linha mais cedo move a âncora, e a decisão fica explícita em vez de o
 * cronograma recuar sozinho por causa de um lead que alguém digitou.
 */
export function agendar(
  linhas: LinhaEntrada[],
  inicioProjeto: Dia,
  cal: Calendario,
  opcoes: OpcoesAgenda = {},
): ResultadoMotor {
  const dataStatus = opcoes.dataStatus ?? null;
  // O dia útil a partir do qual o trabalho não feito pode acontecer.
  const aposStatus = dataStatus ? diaUtilApos(dataStatus, cal) : null;
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const filhos = indexarFilhos(linhas);
  const ehResumo = (id: string) => (filhos.get(id)?.length ?? 0) > 0;

  // Só dependências entre linhas conhecidas entram no grafo.
  const ativa = new Map<string, Vinculo[]>();
  for (const l of linhas) {
    ativa.set(l.id, l.predecessoras.filter((v) => porId.has(v.predecessoraId)));
  }

  const { ordem, ignorados } = ordenar(linhas, ativa);
  const descartada = new Set(ignorados.map((i) => `${i.tarefaId}→${i.predecessoraId}`));

  const inicio = new Map<string, Dia>();
  const fim = new Map<string, Dia>();
  const conflito = new Map<string, boolean>();
  const reprogramada = new Map<string, boolean>();
  const situacao = new Map<string, SituacaoExecucao>();
  const ancora = proximoDiaUtil(inicioProjeto, cal);

  // ── Passe para frente: cada linha no mais cedo que pode ──────────────────
  for (const id of ordem) {
    const l = porId.get(id)!;
    if (ehResumo(id)) continue; // resumo deriva do filho; ver rollup abaixo
    const sit = situacaoDe(l);
    situacao.set(id, sit);

    // Concluída pelo término real: as datas são as que aconteceram.
    if (l.fimReal) {
      const ini = l.inicioReal && l.inicioReal <= l.fimReal ? l.inicioReal : l.fimReal;
      inicio.set(id, ini);
      fim.set(id, l.fimReal);
      conflito.set(id, false);
      reprogramada.set(id, false);
      continue;
    }

    // Início pelo plano: dependências, âncora, restrição. É o início das não iniciadas e, na regra do
    // Project, o "início real" de quem tem % sem data real.
    let iniPlano = ancora;
    for (const v of ativa.get(id) ?? []) {
      if (descartada.has(`${id}→${v.predecessoraId}`)) continue;
      const pi = inicio.get(v.predecessoraId);
      const pf = fim.get(v.predecessoraId);
      if (!pi || !pf) continue; // predecessora é resumo ainda não consolidado
      const candidato = inicioMinimoPor(v, { inicio: pi, fim: pf }, l.duracaoDias, cal);
      if (candidato > iniPlano) iniPlano = candidato;
    }
    const r = aplicarRestricao(iniPlano, l, cal);

    if (sit === "concluida") {
      // 100% sem término real: concluída nas datas do plano (Project). Não se reprograma o que acabou.
      const ini = l.inicioReal ?? r.inicio;
      inicio.set(id, ini);
      fim.set(id, fimPorDuracao(ini, l.duracaoDias, cal));
      conflito.set(id, l.inicioReal ? false : r.conflito);
      reprogramada.set(id, false);
      continue;
    }

    if (sit === "em_andamento") {
      // A parte FEITA (duração × %) fica a partir do início; o restante vem logo depois — ou, se
      // cairia até a Data de Status, no dia útil seguinte a ela.
      const ini = l.inicioReal ?? r.inicio;
      const ocupados = diasOcupados(l.duracaoDias);
      if (ocupados === 0) {
        // Marco "em andamento" (% parcial num marco) é dado estranho: fica no dia em que começou.
        inicio.set(id, ini);
        fim.set(id, ini);
        conflito.set(id, false);
        reprogramada.set(id, false);
        continue;
      }
      const pct = Math.min(99, Math.max(0, l.progresso ?? 0));
      const feitos = Math.min(ocupados - 1, Math.floor((ocupados * pct) / 100));
      let inicioRestante = feitos > 0 ? somarDiasUteis(fimPorDuracao(ini, feitos, cal), 1, cal) : proximoDiaUtil(ini, cal);
      let empurrou = false;
      if (aposStatus && inicioRestante < aposStatus) {
        inicioRestante = aposStatus;
        empurrou = true;
      }
      inicio.set(id, ini);
      fim.set(id, fimPorDuracao(inicioRestante, ocupados - feitos, cal));
      conflito.set(id, l.inicioReal ? false : r.conflito);
      reprogramada.set(id, empurrou);
      continue;
    }

    // Não iniciada: se devia ter começado até a Data de Status, começa depois dela.
    let ini = r.inicio;
    let empurrou = false;
    if (aposStatus && ini < aposStatus) {
      ini = aposStatus;
      empurrou = true;
    }
    inicio.set(id, ini);
    fim.set(id, fimPorDuracao(ini, l.duracaoDias, cal));
    conflito.set(id, r.conflito || (empurrou && !!l.restricaoTipo && RESTRICAO_RIGIDA.has(l.restricaoTipo)));
    reprogramada.set(id, empurrou);
  }

  // ── Rollup: resumo = menor início e maior fim dos filhos (Doc 03 §8) ──────
  // De baixo para cima: um resumo pode ter resumo dentro.
  const profundidade = new Map<string, number>();
  const prof = (id: string): number => {
    const cache = profundidade.get(id);
    if (cache != null) return cache;
    const l = porId.get(id);
    const p = l?.parentId ? prof(l.parentId) + 1 : 0;
    profundidade.set(id, p);
    return p;
  };
  const resumos = linhas.filter((l) => ehResumo(l.id)).sort((a, b) => prof(b.id) - prof(a.id));
  for (const r of resumos) {
    const meus = filhos.get(r.id) ?? [];
    const inis = meus.map((f) => inicio.get(f)).filter((d): d is Dia => d != null);
    const fims = meus.map((f) => fim.get(f)).filter((d): d is Dia => d != null);
    if (inis.length === 0 || fims.length === 0) {
      // Resumo sem filho agendado: cai na âncora, com duração 0, em vez de sumir.
      inicio.set(r.id, ancora);
      fim.set(r.id, ancora);
      continue;
    }
    inicio.set(r.id, inis.reduce((a, b) => (a < b ? a : b)));
    fim.set(r.id, fims.reduce((a, b) => (a > b ? a : b)));
  }

  const todosFins = [...fim.values()];
  const fimProjeto = todosFins.length > 0 ? todosFins.reduce((a, b) => (a > b ? a : b)) : null;

  // ── Passe de volta: até quando cada linha pode ir sem mover o projeto ─────
  const fimTardio = new Map<string, Dia>();
  const sucessoras = new Map<string, { id: string; v: Vinculo }[]>();
  const comecou = (id: string) => (situacao.get(id) ?? "nao_iniciada") !== "nao_iniciada";
  for (const l of linhas) {
    // Sucessora que já começou (ou acabou) não prende mais a predecessora: a realidade já passou por
    // cima do vínculo, e mantê-lo daria à predecessora um prazo tardio no passado.
    if (comecou(l.id)) continue;
    for (const v of ativa.get(l.id) ?? []) {
      if (descartada.has(`${l.id}→${v.predecessoraId}`)) continue;
      const s = sucessoras.get(v.predecessoraId);
      if (s) s.push({ id: l.id, v });
      else sucessoras.set(v.predecessoraId, [{ id: l.id, v }]);
    }
  }

  for (const id of [...ordem].reverse()) {
    if (ehResumo(id)) continue;
    const minhas = sucessoras.get(id) ?? [];
    if (minhas.length === 0 || !fimProjeto) {
      fimTardio.set(id, fimProjeto ?? fim.get(id)!);
      continue;
    }
    let tardio = fimProjeto;
    for (const { id: sid, v } of minhas) {
      const sInicioTardio = inicio.get(sid);
      const sFimTardio = fimTardio.get(sid);
      if (!sInicioTardio || !sFimTardio) continue;
      const l = porId.get(sid)!;
      // O mais tarde que ESTA linha pode terminar sem empurrar a sucessora.
      const sIniTardio = inicioPorDuracao(sFimTardio, l.duracaoDias, cal);
      let limite: Dia;
      switch (v.tipo) {
        case "fs": {
          // Espelha a regra de ida: se a sucessora é marco, ela cai no mesmo dia em que
          // esta linha termina, então o limite é o próprio dia — não o anterior.
          const semLag = aplicarLag(sIniTardio, -v.lagDias, cal);
          limite = diasOcupados(l.duracaoDias) === 0 ? semLag : somarDiasUteis(semLag, -1, cal);
          break;
        }
        case "ss":
          limite = fimPorDuracao(aplicarLag(sIniTardio, -v.lagDias, cal), porId.get(id)!.duracaoDias, cal);
          break;
        case "ff":
          limite = aplicarLag(sFimTardio, -v.lagDias, cal);
          break;
        case "sf":
          limite = fimPorDuracao(aplicarLag(sFimTardio, -v.lagDias, cal), porId.get(id)!.duracaoDias, cal);
          break;
      }
      if (limite < tardio) tardio = limite;
    }
    fimTardio.set(id, tardio);
  }

  // ── Folgas e criticidade ─────────────────────────────────────────────────
  const criticas = new Set<string>();
  const resultado = new Map<string, LinhaAgendada>();

  for (const l of linhas) {
    const ini = inicio.get(l.id)!;
    const f = fim.get(l.id)!;
    const resumo = ehResumo(l.id);

    // Folga total: dias úteis entre o fim calculado e o fim mais tardio possível.
    const tardio = fimTardio.get(l.id);
    const folgaTotal = resumo || !tardio ? 0 : Math.max(0, diasUteisEntre(f, tardio, cal) - 1);

    // Folga livre: quanto cabe antes de mover a PRIMEIRA sucessora.
    let folgaLivre = folgaTotal;
    if (!resumo) {
      const minhas = sucessoras.get(l.id) ?? [];
      for (const { id: sid } of minhas) {
        const sIni = inicio.get(sid);
        if (!sIni) continue;
        const cabe = Math.max(0, diasUteisEntre(f, sIni, cal) - 1);
        if (cabe < folgaLivre) folgaLivre = cabe;
      }
    }

    // Concluída não é crítica: não há mais atraso possível nela (o Project também a tira do caminho).
    const concluida = situacao.get(l.id) === "concluida";
    const critica = !resumo && !concluida && folgaTotal === 0;
    if (critica) criticas.add(l.id);

    // Duração: a do resumo vem dos filhos; a da concluída pelo término real é a que aconteceu.
    const duracaoDias = resumo
      ? diasUteisEntre(ini, f, cal)
      : l.fimReal
        ? l.duracaoDias === 0
          ? 0
          : Math.max(1, diasUteisEntre(ini, f, cal))
        : l.duracaoDias;

    resultado.set(l.id, {
      id: l.id,
      inicio: ini,
      fim: f,
      duracaoDias,
      folgaTotal,
      folgaLivre,
      critica,
      progresso: 0, // preenchido no rollup de progresso, abaixo
      trabalhoHoras: null, // idem
      conflitoRestricao: conflito.get(l.id) ?? false,
      ehResumo: resumo,
      situacao: resumo ? "nao_iniciada" : (situacao.get(l.id) ?? "nao_iniciada"),
      reprogramada: reprogramada.get(l.id) ?? false,
    });
  }

  aplicarProgresso(linhas, filhos, resultado);

  return { linhas: resultado, criticas, fimProjeto, ciclosIgnorados: ignorados };
}

/**
 * Progresso: folha usa o informado; resumo é PONDERADO POR HORAS PREVISTAS (D26).
 *
 * Nunca digitado no resumo (Doc 03 §23). O peso por horas, e não por duração, é o que
 * impede "aprovação na prefeitura" — 45 dias de espera e 2 horas de trabalho — de dominar
 * sozinha o percentual da disciplina.
 *
 * Pesa por horas SÓ quando todo filho com peso tem horas CONHECIDAS (`0` conta como
 * conhecida; `null` não) e o total passa de zero. Basta um filho sem estimativa para o
 * resumo inteiro voltar a pesar por duração, o padrão do MS Project.
 *
 * A regra anterior ("algum filho tem horas → pesa por horas") dava peso ZERO ao irmão
 * ainda não estimado: o avanço dele sumia da conta em silêncio, e a linha herdada da
 * disciplina — que nasce com zero hora — reescreveria o percentual de projetos que
 * ninguém tocou. Marco fica fora da checagem: pesa zero nos dois critérios.
 */
function aplicarProgresso(
  linhas: LinhaEntrada[],
  filhos: Map<string, string[]>,
  resultado: Map<string, LinhaAgendada>,
): void {
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const calculado = new Map<string, number>();

  // Folha sem filhos e sem duração: pesa zero em qualquer critério.
  const ehMarco = (id: string) => (filhos.get(id)?.length ?? 0) === 0 && (porId.get(id)?.duracaoDias ?? 0) === 0;

  // Horas da linha: a informada na folha; no resumo, soma dos filhos — `null` se algum
  // filho (que não seja marco) estiver sem estimativa.
  const horasCache = new Map<string, number | null>();
  const horas = (id: string): number | null => {
    if (horasCache.has(id)) return horasCache.get(id)!;
    const meus = filhos.get(id) ?? [];
    let h: number | null;
    if (meus.length === 0) {
      const informado = porId.get(id)?.trabalhoHoras;
      h = informado != null && Number.isFinite(informado) ? informado : ehMarco(id) ? 0 : null;
    } else {
      h = 0;
      for (const f of meus) {
        const hf = horas(f);
        if (hf == null) {
          h = null;
          break;
        }
        h += hf;
      }
    }
    horasCache.set(id, h);
    return h;
  };

  const calcular = (id: string): number => {
    const cache = calculado.get(id);
    if (cache != null) return cache;
    const meus = filhos.get(id) ?? [];
    if (meus.length === 0) {
      const p = Math.min(100, Math.max(0, porId.get(id)?.progresso ?? 0));
      calculado.set(id, p);
      return p;
    }
    let somaPeso = 0;
    let somaProduto = 0;
    const comPeso = meus.filter((f) => !ehMarco(f));
    const temHoras =
      comPeso.length > 0 &&
      comPeso.every((f) => horas(f) != null) &&
      comPeso.reduce((s, f) => s + (horas(f) ?? 0), 0) > 0;
    for (const f of meus) {
      const peso = temHoras ? (horas(f) ?? 0) : (resultado.get(f)?.duracaoDias ?? 0);
      somaPeso += peso;
      somaProduto += peso * calcular(f);
    }
    const p = somaPeso > 0 ? Math.round(somaProduto / somaPeso) : 0;
    calculado.set(id, p);
    return p;
  };

  for (const l of linhas) {
    const r = resultado.get(l.id);
    if (!r) continue;
    r.progresso = calcular(l.id);
    r.trabalhoHoras = horas(l.id);
  }
}
