import "server-only";
import { prisma } from "@/lib/prisma";
import { GLOBAL_ROLES } from "@/lib/roles";
import { enviarPush } from "@/lib/push";

export async function notificar(input: {
  userId: string;
  titulo: string;
  corpo?: string;
  href?: string;
}): Promise<void> {
  await prisma.notificacao.create({ data: input });
  await enviarPush(input.userId, {
    title: input.titulo,
    body: input.corpo,
    url: input.href,
    tag: input.href,
  });
}

/** Notifica todos os admins (e supervisores) — usado por solicitações sensíveis. */
export async function notificarAdmins(input: {
  titulo: string;
  corpo?: string;
  href?: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: { in: GLOBAL_ROLES }, ativo: true },
    select: { id: true },
  });
  if (admins.length === 0) return;
  await prisma.notificacao.createMany({
    data: admins.map((a) => ({ userId: a.id, ...input })),
  });
  await Promise.all(
    admins.map((a) =>
      enviarPush(a.id, { title: input.titulo, body: input.corpo, url: input.href, tag: input.href }),
    ),
  );
}
