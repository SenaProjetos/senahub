import "server-only";
import { prisma } from "@/lib/prisma";
import { pageCount } from "@/lib/list-params";

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
