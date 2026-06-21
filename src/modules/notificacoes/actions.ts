"use server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listarNotificacoes } from "@/modules/notificacoes/queries";

/** Lista notificações do usuário atual (usado pelo polling do sininho). */
export async function buscarNotificacoes() {
  const session = await getSession();
  if (!session) return { itens: [], naoLidas: 0 };
  return listarNotificacoes(session.user.id);
}

export async function marcarLida(id: string) {
  const session = await getSession();
  if (!session) return { ok: false };
  await prisma.notificacao.updateMany({
    where: { id, userId: session.user.id },
    data: { lida: true },
  });
  return { ok: true };
}

export async function marcarTodasLidas() {
  const session = await getSession();
  if (!session) return { ok: false };
  await prisma.notificacao.updateMany({
    where: { userId: session.user.id, lida: false },
    data: { lida: true },
  });
  return { ok: true };
}

/** Marca como NÃO lida (volta a contar no badge). */
export async function marcarNaoLida(id: string) {
  const session = await getSession();
  if (!session) return { ok: false };
  await prisma.notificacao.updateMany({
    where: { id, userId: session.user.id },
    data: { lida: false },
  });
  return { ok: true };
}

/** Exclui uma notificação do usuário atual. */
export async function excluirNotificacao(id: string) {
  const session = await getSession();
  if (!session) return { ok: false };
  await prisma.notificacao.deleteMany({
    where: { id, userId: session.user.id },
  });
  return { ok: true };
}
