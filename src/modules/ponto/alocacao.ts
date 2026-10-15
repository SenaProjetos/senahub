/**
 * Valores especiais do seletor de alocação. Não são IDs de projeto e nunca são
 * persistidos como tal: antes de gravar, `normalizarAlocacaoPonto` os converte
 * na categoria correspondente da sessão.
 */
export const ALOCACAO_SEM_PROJETO = "__sem_projeto";
export const ALOCACAO_REUNIAO_INTERNA = "__reuniao_interna";
export const ALOCACAO_REUNIAO_EXTERNA = "__reuniao_externa";

export type TipoAlocacaoPonto =
  | "projeto"
  | "sem_projeto"
  | "reuniao_interna"
  | "reuniao_externa";

export const ROTULO_TIPO_ALOCACAO: Record<Exclude<TipoAlocacaoPonto, "projeto">, string> = {
  sem_projeto: "Sem projeto",
  reuniao_interna: "Reunião interna",
  reuniao_externa: "Reunião externa",
};

export function normalizarAlocacaoPonto(selecao?: string | null): {
  projetoId: string | null;
  tipoAlocacao: TipoAlocacaoPonto;
} {
  // Reunião ligada a projeto (decisão 10 do rateio): "__reuniao_externa:<projetoId>".
  const dois = selecao?.indexOf(":") ?? -1;
  if (selecao && dois > 0) {
    const base = selecao.slice(0, dois);
    const projeto = selecao.slice(dois + 1);
    if (base === ALOCACAO_REUNIAO_INTERNA) return { projetoId: projeto || null, tipoAlocacao: "reuniao_interna" };
    if (base === ALOCACAO_REUNIAO_EXTERNA) return { projetoId: projeto || null, tipoAlocacao: "reuniao_externa" };
  }
  switch (selecao) {
    case ALOCACAO_REUNIAO_INTERNA:
      return { projetoId: null, tipoAlocacao: "reuniao_interna" };
    case ALOCACAO_REUNIAO_EXTERNA:
      return { projetoId: null, tipoAlocacao: "reuniao_externa" };
    case ALOCACAO_SEM_PROJETO:
    case "":
    case undefined:
    case null:
      return { projetoId: null, tipoAlocacao: "sem_projeto" };
    default:
      return { projetoId: selecao, tipoAlocacao: "projeto" };
  }
}

/** A seleção é um projeto REAL — e não "sem projeto" nem reunião? Só nesse caso há tarefa a escolher (F6). */
export function selecaoEhProjeto(selecao: string | null | undefined): boolean {
  return normalizarAlocacaoPonto(selecao).tipoAlocacao === "projeto";
}

/** Valor que deve voltar ao seletor para representar a sessão persistida. */
export function selecaoDaAlocacaoPonto(
  projetoId: string | null,
  tipoAlocacao: TipoAlocacaoPonto,
): string {
  if (projetoId && tipoAlocacao === "reuniao_interna") return `${ALOCACAO_REUNIAO_INTERNA}:${projetoId}`;
  if (projetoId && tipoAlocacao === "reuniao_externa") return `${ALOCACAO_REUNIAO_EXTERNA}:${projetoId}`;
  if (projetoId) return projetoId;
  switch (tipoAlocacao) {
    case "reuniao_interna":
      return ALOCACAO_REUNIAO_INTERNA;
    case "reuniao_externa":
      return ALOCACAO_REUNIAO_EXTERNA;
    case "projeto":
    case "sem_projeto":
      return ALOCACAO_SEM_PROJETO;
  }
}

/**
 * Tarefa (F6) que vale para o destino do card de ponto do celular, ou "" para nenhuma. Rodando, é a
 * da sessão aberta — trocar de tarefa grava na hora, então não há escolha pendente. Parado, é a que
 * a pessoa escolheu na gaveta ou, sem escolha, a da sessão a retomar quando o destino é o mesmo
 * projeto dela (volta do descanso mantém a tarefa, como no seletor do computador). Destino que não
 * é projeto não tem tarefa. Destino igual ao SUGERIDO (atividade de hoje no cronograma, reunião de
 * 08/10/2026) já traz a atividade sugerida.
 */
export function tarefaDoDestino(p: {
  destino: string;
  rodando: boolean;
  selecaoCorrente: string;
  tarefaCorrenteId: string;
  /** `null` = a pessoa não escolheu nada para este destino. */
  escolhida: string | null;
  /** Atividade de hoje sugerida pelo cronograma (`sugestaoParaPonto`), se houver. */
  sugerida?: { destino: string; tarefaId: string } | null;
}): string {
  if (!selecaoEhProjeto(p.destino)) return "";
  if (p.rodando) return p.destino === p.selecaoCorrente ? p.tarefaCorrenteId : "";
  if (p.escolhida !== null) return p.escolhida;
  if (p.destino === p.selecaoCorrente) return p.tarefaCorrenteId;
  return p.sugerida && p.destino === p.sugerida.destino ? p.sugerida.tarefaId : "";
}

export function rotuloAlocacaoSemProjeto(tipoAlocacao: TipoAlocacaoPonto): string {
  return tipoAlocacao === "projeto" ? "Projeto" : ROTULO_TIPO_ALOCACAO[tipoAlocacao];
}

export type ProjetoAlocacao = {
  id: string;
  codigo: string;
  nome: string;
  /** Quantas disciplinas do projeto a pessoa responde hoje (R2.4): com 2+, a tarefa é obrigatória. */
  disciplinasDaPessoa?: number;
};

/**
 * Seleção de reunião separada em tipo e projeto (R2.4): o seletor mostra a reunião num campo e o
 * projeto opcional noutro. `null` quando a seleção não é reunião.
 */
export function reuniaoDaSelecao(selecao: string | null | undefined): { base: string; projetoId: string } | null {
  const n = normalizarAlocacaoPonto(selecao);
  if (n.tipoAlocacao === "reuniao_interna") return { base: ALOCACAO_REUNIAO_INTERNA, projetoId: n.projetoId ?? "" };
  if (n.tipoAlocacao === "reuniao_externa") return { base: ALOCACAO_REUNIAO_EXTERNA, projetoId: n.projetoId ?? "" };
  return null;
}

/** Inverso de `reuniaoDaSelecao`: `__reuniao_externa` ou `__reuniao_externa:<projetoId>`. */
export function selecaoDeReuniao(base: string, projetoId: string): string {
  return projetoId ? `${base}:${projetoId}` : base;
}

/**
 * Texto da sessão: o projeto, o tipo sem projeto, ou os dois quando a reunião é ligada a um projeto
 * ("Reunião externa · 0123 Casa"). `projetoRotulo` já vem formatado (código + nome).
 */
export function rotuloDaSessao(tipo: TipoAlocacaoPonto, projetoRotulo: string | null): string {
  if (tipo === "projeto") return projetoRotulo ?? "Projeto";
  const base = ROTULO_TIPO_ALOCACAO[tipo];
  return projetoRotulo ? `${base} · ${projetoRotulo}` : base;
}

/**
 * A tarefa é obrigatória neste destino? Projeto real em que a pessoa responde por 2+ disciplinas —
 * e só quando há tarefa para escolher: sem nenhuma (`tarefasDisponiveis === 0`, ex.: coordenação
 * ainda não planejou) as horas entram no projeto sem disciplina. `null`/`undefined` = lista ainda
 * não carregada, segue obrigatória (o servidor decide igual: `resolverDestinoDaSessao`).
 */
export function tarefaObrigatoria(
  selecao: string | null | undefined,
  projetos: readonly ProjetoAlocacao[],
  tarefasDisponiveis?: number | null,
): boolean {
  if (!selecaoEhProjeto(selecao)) return false;
  if (tarefasDisponiveis === 0) return false;
  return (projetos.find((p) => p.id === selecao)?.disciplinasDaPessoa ?? 0) >= 2;
}

/** Uma alocação já usada, pronta para virar linha de troca rápida no card de ponto. */
export type AlocacaoRecente = {
  /** Valor do seletor (id do projeto ou `ALOCACAO_*`) — o mesmo que `trocarProjeto` recebe. */
  selecao: string;
  tipoAlocacao: TipoAlocacaoPonto;
  projeto: ProjetoAlocacao | null;
};

/**
 * Alocações distintas, na ordem em que chegam (mais recente primeiro), até `limite`.
 * "Sem projeto" fica de fora: está sempre à mão na lista completa, e como atalho só ocuparia
 * a vaga de um projeto. Sessão de projeto sem o projeto (apagado ou fora de andamento, filtrado
 * pela consulta) também sai — não há para onde trocar.
 */
export function alocacoesDistintas(
  sessoes: { tipoAlocacao: TipoAlocacaoPonto; projeto: ProjetoAlocacao | null }[],
  limite: number,
): AlocacaoRecente[] {
  const vistas = new Set<string>();
  const out: AlocacaoRecente[] = [];
  for (const s of sessoes) {
    if (out.length >= limite) break;
    if (s.tipoAlocacao === "sem_projeto") continue;
    if (s.tipoAlocacao === "projeto" && !s.projeto) continue;
    const selecao = selecaoDaAlocacaoPonto(s.projeto?.id ?? null, s.tipoAlocacao);
    if (vistas.has(selecao)) continue;
    vistas.add(selecao);
    // Reunião ligada a projeto leva o projeto junto: o atalho diz "Reunião externa · Casa X", não só "Reunião externa".
    out.push({ selecao, tipoAlocacao: s.tipoAlocacao, projeto: s.projeto });
  }
  return out;
}
