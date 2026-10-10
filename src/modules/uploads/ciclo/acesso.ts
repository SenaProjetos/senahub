import "server-only";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import type { SessionUser } from "@/lib/session";
import { ActionError } from "@/lib/with-action";
import { exigirEscopoDocumento } from "@/modules/uploads/escopo-documento";

/** "Só um administrador, com motivo" (D5-b): o bypass de verdade é `superUsuario`; `admin` por papel também. */
export function ehAdminDoCiclo(user: Pick<SessionUser, "superUsuario" | "role">): boolean {
  return user.superUsuario;
}

/**
 * I9: quem tem `arquivos:somente_liberado_obra` só enxerga revisões com liberação para obra ativa.
 * É uma RESTRIÇÃO, então o bypass do `can()` (superusuário passa em tudo) não pode valer aqui: admin
 * nunca é restringido.
 */
export async function restritoALiberadoObra(user: SessionUser): Promise<boolean> {
  if (ehAdminDoCiclo(user)) return false;
  return can(user, "arquivos", "somente_liberado_obra");
}

/** A muralha da disciplina dona da revisão (mesma de documento/Upload). */
export async function exigirEscopoDaRevisao(user: SessionUser, revisaoId: string): Promise<void> {
  const r = await prisma.documentoRevisao.findUnique({
    where: { id: revisaoId },
    select: { documento: { select: { disciplina: { select: { projetoId: true, responsaveis: { select: { userId: true } } } } } } },
  });
  if (!r) throw new ActionError("Revisão não encontrada.");
  await exigirEscopoDocumento(user, r.documento.disciplina);
}

export async function exigirEscopoDoControle(user: SessionUser, controleId: string): Promise<string> {
  const c = await prisma.controleRevisao.findUnique({ where: { id: controleId }, select: { revisaoId: true, tipo: true } });
  if (!c) throw new ActionError("Controle não encontrado.");
  await exigirEscopoDaRevisao(user, c.revisaoId);
  return c.tipo;
}
