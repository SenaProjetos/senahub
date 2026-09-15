import "server-only";
import { prisma } from "@/lib/prisma";
import { pageCount } from "@/lib/list-params";
import {
  agruparNotificacoes,
  contarNaoLidasAgrupadas,
  type GrupoNotificacao,
} from "@/modules/notificacoes/agrupar";

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
/** Linhas não lidas consideradas no badge. O badge satura em "99+", então passar disso só
 *  custa leitura: com 500 linhas, só fica abaixo do real quem tem >500 pendências em <100 grupos. */
const LIMITE_CONTAGEM = 500;

/**
 * Lista para o sino, com notificações equivalentes consolidadas num item só.
 *
 * `naoLidas` é a contagem de GRUPOS não lidos — o mesmo que o painel mostra, não o de linhas
 * (ver `contarNaoLidasAgrupadas`). /notificacoes, que é linear, segue contando linhas.
 * Nada é descartado: cada grupo carrega os ids que representa.
 * Limitação aceita: uma ocorrência além das `LIMITE_BUSCA` linhas não entra no grupo — o sino
 * é prévia; o registro completo está em /notificacoes.
 */
export async function listarNotificacoesAgrupadas(
  userId: string,
): Promise<{ grupos: GrupoNotificacao[]; naoLidas: number }> {
  const [itens, pendentes] = await Promise.all([
    prisma.notificacao.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: LIMITE_BUSCA,
    }),
    prisma.notificacao.findMany({
      where: { userId, lida: false },
      orderBy: { createdAt: "desc" },
      take: LIMITE_CONTAGEM,
      select: { id: true, titulo: true, corpo: true, href: true, lida: true, createdAt: true },
    }),
  ]);
  return {
    grupos: agruparNotificacoes(itens).slice(0, LIMITE_GRUPOS),
    naoLidas: contarNaoLidasAgrupadas(pendentes),
  };
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
