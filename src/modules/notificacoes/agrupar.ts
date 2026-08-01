/**
 * Agrupamento de notificações repetidas — motor puro (sem Prisma, sem I/O).
 *
 * O mesmo evento pode gerar várias notificações idênticas em poucos minutos: o envio
 * de arquivos manda 1 request por arquivo (para exibir progresso individual), e cada
 * request avisa os validadores. Cinco arquivos = cinco linhas iguais no sino.
 *
 * Aqui o agrupamento é só de APRESENTAÇÃO: nenhuma notificação é descartada ou alterada,
 * o grupo apenas carrega os ids de tudo que ele representa. A listagem completa
 * (/notificacoes) continua linear.
 */

/**
 * Janela em que notificações idênticas são apresentadas como um só item.
 * 15 min cobre o envio de uma pasta inteira sem colar eventos de momentos
 * distintos do dia (dois envios da mesma disciplina de manhã e à tarde ficam separados).
 */
export const JANELA_AGRUPAMENTO_MS = 15 * 60_000;

/**
 * Separador da chave. NUL nunca aparece nos textos das notificações; um separador comum
 * (espaço, "|") colidiria — titulo com espaço final + corpo com espaço inicial gerariam
 * a mesma chave que outro par.
 */
const SEP = String.fromCharCode(0);

export type NotificacaoBruta = {
  id: string;
  titulo: string;
  corpo: string | null;
  href: string | null;
  lida: boolean;
  createdAt: Date;
};

export type GrupoNotificacao = {
  chave: string;
  titulo: string;
  corpo: string | null;
  href: string | null;
  /** Ids de TODAS as notificações representadas — marcar/excluir age sobre a lista inteira. */
  ids: string[];
  /** Quantas notificações o item representa (o "5×" do painel). */
  total: number;
  /** 0 = grupo todo lido. Maior que 0 sombreia o item no sino. */
  naoLidas: number;
  /** Data da ocorrência MAIS RECENTE do grupo. */
  createdAt: Date;
};

/**
 * Chave de identidade do evento. Igualdade EXATA de titulo+corpo+href.
 *
 * Normalizar dígitos (ex.: trocar números por "#") fundiria eventos distintos — a agenda
 * emite `corpo: "${titulo} — ${data}"`, então "Reunião semanal — 05/08" e
 * "Reunião semanal — 12/08" virariam o mesmo item.
 *
 * `lida` fica FORA da chave de propósito: /notificacoes marca linhas individualmente, e se
 * o estado de leitura entrasse aqui, ler 2 de 5 partiria o grupo em dois blocos idênticos
 * lado a lado — exatamente a poluição que este módulo existe para evitar.
 */
function chaveDe(n: NotificacaoBruta): string {
  return [n.titulo, n.corpo ?? "", n.href ?? ""].join(SEP);
}

/**
 * Agrupa notificações equivalentes emitidas dentro de `janelaMs`.
 *
 * Espera `itens` já ordenados por `createdAt` decrescente (o que as queries entregam) e
 * preserva essa ordem na saída. A janela é medida sempre contra o item mais NOVO do grupo
 * — nunca em cadeia — senão um gotejamento lento fundiria itens de horas diferentes.
 */
export function agruparNotificacoes(
  itens: NotificacaoBruta[],
  janelaMs: number = JANELA_AGRUPAMENTO_MS,
): GrupoNotificacao[] {
  const grupos: GrupoNotificacao[] = [];
  // Só o grupo AINDA ABERTO de cada chave; ao estourar a janela ele é substituído.
  const abertos = new Map<string, GrupoNotificacao>();

  for (const n of itens) {
    const chave = chaveDe(n);
    const aberto = abertos.get(chave);
    const dentroDaJanela =
      aberto !== undefined
      && aberto.createdAt.getTime() - n.createdAt.getTime() <= janelaMs;

    if (aberto && dentroDaJanela) {
      aberto.ids.push(n.id);
      aberto.total += 1;
      if (!n.lida) aberto.naoLidas += 1;
      continue;
    }

    const novo: GrupoNotificacao = {
      chave,
      titulo: n.titulo,
      corpo: n.corpo,
      href: n.href,
      ids: [n.id],
      total: 1,
      naoLidas: n.lida ? 0 : 1,
      createdAt: n.createdAt,
    };
    grupos.push(novo);
    abertos.set(chave, novo);
  }

  return grupos;
}
