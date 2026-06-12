import "server-only";
import { prisma } from "@/lib/prisma";

/** Canais do usuário com prévia da última mensagem e contagem de não lidas. */
export async function listarCanais(userId: string) {
  const membros = await prisma.canalMembro.findMany({
    where: { userId },
    include: {
      canal: {
        include: {
          mensagens: { orderBy: { createdAt: "desc" }, take: 1, include: { autor: { select: { name: true } } } },
          membros: {
            where: { userId: { not: userId } },
            include: { user: { select: { id: true, name: true, chatStatus: true } } },
          },
        },
      },
    },
  });

  const resultado = await Promise.all(
    membros.map(async (m) => {
      const naoLidas = await prisma.mensagem.count({
        where: {
          canalId: m.canalId,
          autorId: { not: userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
      const ultima = m.canal.mensagens[0];
      // Nome do DM = o outro participante.
      const outro = m.canal.membros[0]?.user;
      const nome =
        m.canal.tipo === "dm" ? (outro?.name ?? "Conversa") : (m.canal.nome ?? m.canal.tipo);
      return {
        id: m.canal.id,
        tipo: m.canal.tipo,
        nome,
        outroUserId: m.canal.tipo === "dm" ? (outro?.id ?? null) : null,
        ultima: ultima
          ? { conteudo: ultima.conteudo, autor: ultima.autor.name, createdAt: ultima.createdAt }
          : null,
        naoLidas,
      };
    }),
  );

  // Ordena: não lidas primeiro, depois por última atividade.
  return resultado.sort((a, b) => {
    if (a.naoLidas !== b.naoLidas) return b.naoLidas - a.naoLidas;
    const ta = a.ultima?.createdAt.getTime() ?? 0;
    const tb = b.ultima?.createdAt.getTime() ?? 0;
    return tb - ta;
  });
}

/** Verifica se o usuário é membro do canal. */
export async function ehMembro(canalId: string, userId: string) {
  const m = await prisma.canalMembro.findUnique({
    where: { canalId_userId: { canalId, userId } },
  });
  return !!m;
}

/** Mensagens do canal (mais recentes ao fim). Exige ser membro. */
export async function mensagensCanal(canalId: string, userId: string, limite = 100) {
  if (!(await ehMembro(canalId, userId))) return null;
  const msgs = await prisma.mensagem.findMany({
    where: { canalId },
    orderBy: { createdAt: "desc" },
    take: limite,
    include: { autor: { select: { id: true, name: true } } },
  });
  return msgs.reverse();
}

/** Membros do canal (para presença e menções). */
export async function membrosCanal(canalId: string) {
  const m = await prisma.canalMembro.findMany({
    where: { canalId },
    include: { user: { select: { id: true, name: true, chatStatus: true } } },
  });
  return m.map((x) => x.user);
}

/** Usuários para abrir DM (internos, exceto o próprio e clientes/freelancers). */
export async function usuariosParaDM(userId: string) {
  return prisma.user.findMany({
    where: { ativo: true, id: { not: userId }, role: { notIn: ["cliente", "freelancer"] as never } },
    select: { id: true, name: true, role: true, chatStatus: true },
    orderBy: { name: "asc" },
  });
}

export type CanalListItem = Awaited<ReturnType<typeof listarCanais>>[number];
export type MensagemItem = NonNullable<Awaited<ReturnType<typeof mensagensCanal>>>[number];
