import "server-only";
import { prisma } from "@/lib/prisma";
import { acessoGlobal, type EscopoDeDados } from "@/lib/roles";

/**
 * Quem enxerga uma prancha do projeto (visualizador, download, aba Problemas): acesso global, responsável
 * da disciplina, membro do projeto ou responsável de OUTRA disciplina dele. Fora de um arquivo
 * `"use server"` de propósito: lá, uma função exportada viraria Server Action chamável de fora.
 */
export async function podeAcessarPrancha(
  user: EscopoDeDados & { id: string },
  disciplina: { projetoId: string; responsaveis: readonly { userId: string }[] },
): Promise<boolean> {
  if (acessoGlobal(user)) return true;
  if (disciplina.responsaveis.some((r) => r.userId === user.id)) return true;
  const membro = await prisma.projetoMembro.findFirst({
    where: { projetoId: disciplina.projetoId, userId: user.id },
    select: { userId: true },
  });
  if (membro) return true;
  return (await prisma.disciplina.count({ where: { projetoId: disciplina.projetoId, responsaveis: { some: { userId: user.id } } } })) > 0;
}
