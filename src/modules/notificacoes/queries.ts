import "server-only";
import { prisma } from "@/lib/prisma";
import { pageCount } from "@/lib/list-params";
import { agruparNotificacoes, type GrupoNotificacao } from "@/modules/notificacoes/agrupar";

export async function listarNotificacoes(userId: string, limite = 20) {
  const [itens, naoLidas] = await Promise.all([
    prisma.notificacao.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
    prisma.notificacao.count({ where: { userId, lida: false } }),
  ]);
  return { itens, naoLidas };
}

/** Linhas buscadas antes de agrupar. Over-fetch: sem ele, agrupar depois do corte deixaria
 *  o sino com menos de LIMITE_GRUPOS itens sempre que houvesse repetição. */
const LIMITE_BUSCA = 60;
/** Grupos exibidos no sino. */
const LIMITE_GRUPOS = 20;

/**
 * Lista para o sino, com notificações equivalentes consolidadas num item só.
 *
 * `naoLidas` continua sendo a contagem de LINHAS (o badge não muda de semântica).
 * Nada é descartado: cada grupo carrega os ids que representa, e /notificacoes segue linear.
 * Limitação aceita: uma ocorrência além das `LIMITE_BUSCA` linhas não entra no grupo — o sino
 * é prévia; o registro completo está em /notificacoes.
 */
export async function listarNotificacoesAgrupadas(
  userId: string,
): Promise<{ grupos: GrupoNotificacao[]; naoLidas: number }> {
  const [itens, naoLidas] = await Promise.all([
    prisma.notificacao.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: LIMITE_BUSCA,
    }),
    prisma.notificacao.count({ where: { userId, lida: false } }),
  ]);
  return { grupos: agruparNotificacoes(itens).slice(0, LIMITE_GRUPOS), naoLidas };
}

export type FiltroNotificacao = "todas" | "nao_lidas" | "lidas";

/** Listagem paginada completa — usada pela página "Ver tudo" (/notificacoes). */
export async function listarNotificacoesPaginado(
  userId: string,
  { skip, take, filtro }: { skip: number; take: number; filtro: FiltroNotificacao },
) {
  const filtroWhere =
    filtro === "nao_lidas" ? { lida: false } : filtro === "lidas" ? { lida: true } : {};
  const where = { userId, ...filtroWhere };

  const [itens, total, naoLidas] = await Promise.all([
    prisma.notificacao.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.notificacao.count({ where }),
    prisma.notificacao.count({ where: { userId, lida: false } }),
  ]);

  return { itens, total, naoLidas, take, pageCount: pageCount(total, take) };
}
