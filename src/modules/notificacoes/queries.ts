import "server-only";
import { prisma } from "@/lib/prisma";

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
