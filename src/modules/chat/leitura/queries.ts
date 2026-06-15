import "server-only";
import { prisma } from "@/lib/prisma";

/** Quem já leu uma mensagem (recibos) (E6). */
export async function leitoresDaMensagem(mensagemId: string) {
  const ls = await prisma.mensagemLeitura.findMany({
    where: { mensagemId },
    include: { user: { select: { name: true } } },
    orderBy: { lidaEm: "asc" },
  });
  return ls.map((l) => ({ nome: l.user.name, lidaEm: l.lidaEm.toISOString() }));
}
