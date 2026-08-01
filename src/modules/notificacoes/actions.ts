"use server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listarNotificacoesAgrupadas } from "@/modules/notificacoes/queries";

/**
 * Teto do lote. O sino manda os ids de um grupo inteiro; o limite evita que uma lista
 * arbitrariamente grande chegue do cliente.
 */
const MAX_IDS = 200;

/** Lista agrupada do usuário atual (usado pelo polling do sininho). */
export async function buscarNotificacoes() {
  const session = await getSession();
  if (!session) return { grupos: [], naoLidas: 0 };
  return listarNotificacoesAgrupadas(session.user.id);
}

/** Marca um grupo inteiro como lido. Sempre escopado ao próprio usuário. */
export async function marcarLidas(ids: string[]) {
  const session = await getSession();
  if (!session || ids.length === 0) return { ok: false };
  await prisma.notificacao.updateMany({
    where: { id: { in: ids.slice(0, MAX_IDS) }, userId: session.user.id },
    data: { lida: true },
  });
  return { ok: true };
}

/** Marca um grupo inteiro como NÃO lido (volta a contar no badge). */
export async function marcarNaoLidas(ids: string[]) {
  const session = await getSession();
  if (!session || ids.length === 0) return { ok: false };
  await prisma.notificacao.updateMany({
    where: { id: { in: ids.slice(0, MAX_IDS) }, userId: session.user.id },
    data: { lida: false },
  });
  return { ok: true };
}

/**
 * Exclui um grupo inteiro. É por grupo de propósito: apagar só parte das notificações
 * equivalentes faria o item reaparecer no próximo poll.
 */
export async function excluirNotificacoes(ids: string[]) {
  const session = await getSession();
  if (!session || ids.length === 0) return { ok: false };
  await prisma.notificacao.deleteMany({
    where: { id: { in: ids.slice(0, MAX_IDS) }, userId: session.user.id },
  });
  return { ok: true };
}

export async function marcarLida(id: string) {
  return marcarLidas([id]);
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
  return marcarNaoLidas([id]);
}

/** Exclui uma notificação do usuário atual. */
export async function excluirNotificacao(id: string) {
  return excluirNotificacoes([id]);
}
