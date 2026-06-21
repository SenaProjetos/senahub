import "server-only";
import { prisma } from "@/lib/prisma";

export type ResultadoBuscaMensagem = {
  id: string;
  canalId: string;
  conteudo: string;
  autorNome: string;
  createdAt: Date;
};

/**
 * Busca mensagens por conteúdo (case-insensitive), restrita aos canais de que o
 * usuário é membro e ignorando mensagens excluídas (C4-4, achado #24).
 */
export async function buscarMensagens(
  userId: string,
  termo: string,
  limite = 30,
): Promise<ResultadoBuscaMensagem[]> {
  const t = termo.trim();
  if (t.length < 2) return [];
  const msgs = await prisma.mensagem.findMany({
    where: {
      excluidaEm: null,
      conteudo: { contains: t, mode: "insensitive" },
      canal: { membros: { some: { userId } } },
    },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      canalId: true,
      conteudo: true,
      createdAt: true,
      autor: { select: { name: true } },
    },
  });
  return msgs.map((m) => ({
    id: m.id,
    canalId: m.canalId,
    conteudo: m.conteudo,
    autorNome: m.autor.name,
    createdAt: m.createdAt,
  }));
}
