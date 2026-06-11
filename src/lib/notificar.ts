import "server-only";
import { prisma } from "@/lib/prisma";
import { enviarPush } from "@/lib/push";

export type NotificacaoInput = {
  titulo: string;
  corpo?: string;
  href?: string;
  tag?: string;
};

/** Cria a notificação interna (sino) e dispara Web Push para um usuário. */
export async function notificar(userId: string, n: NotificacaoInput): Promise<void> {
  await prisma.notificacao.create({
    data: { userId, titulo: n.titulo, corpo: n.corpo, href: n.href },
  });
  await enviarPush(userId, { title: n.titulo, body: n.corpo, url: n.href, tag: n.tag });
}

/** Notifica vários usuários (deduplicados). */
export async function notificarMuitos(userIds: string[], n: NotificacaoInput): Promise<void> {
  const unicos = [...new Set(userIds)];
  await Promise.all(unicos.map((id) => notificar(id, n)));
}
