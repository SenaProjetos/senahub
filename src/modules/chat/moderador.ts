import "server-only";
import { prisma } from "@/lib/prisma";
import { permissaoEfetiva } from "@/lib/permissao-efetiva";
import type { ModeradorChat } from "@/modules/chat/acesso";

type Sujeito = { id: string; ativo: boolean; superUsuario: boolean; perfilId: string | null };

/**
 * Resolve o `ModeradorChat` de quem está pedindo — superusuário ou `chat:moderar` (Onda F, §16.4).
 * Só os caminhos que leem fora da membresia chamam isto; não está na sessão porque custaria uma
 * consulta a mais em TODA página para uma pergunta que só o chat faz.
 */
export async function moderadorChat(u: Sujeito): Promise<ModeradorChat> {
  if (u.superUsuario) return { superUsuario: true, moderaChat: true };
  return { superUsuario: false, moderaChat: await permissaoEfetiva(u, "chat", "moderar") };
}

/** Mesmo que `moderadorChat`, a partir do id — para o socket, que só tem o id do handshake. */
export async function moderadorChatPorId(userId: string): Promise<ModeradorChat> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, ativo: true, superUsuario: true, perfilId: true },
  });
  if (!u) return { superUsuario: false, moderaChat: false };
  return moderadorChat(u);
}
