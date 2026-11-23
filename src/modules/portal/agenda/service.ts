import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { podeVerConversaDoProjeto } from "@/modules/portal/mensagens/service";
import {
  MOTIVO_AGENDA_NAO_ENCONTRADA,
  MOTIVO_MARCO_ENTREGUE,
  MOTIVO_NOTA_LONGA,
  MOTIVO_NOTA_VAZIA,
  MOTIVO_SEM_NOTA,
  NOTA_MAX,
  marcosDaAgenda,
  type MarcoDaAgenda,
} from "./marcos";
import { carregarEntradaDaAgenda } from "./queries";

/**
 * Único escritor da agenda do portal (spec docs/superpowers/specs/2026-11-23-portal-agenda-contrato-design.md). A porta da
 * EQUIPE é a audiência da conversa (`podeVerConversaDoProjeto`); fora dela, ou marco que a agenda não mostra:
 * "Agenda não encontrada.".
 */

const naoEncontrada = () => new ActionError(MOTIVO_AGENDA_NAO_ENCONTRADA);

/** O marco tem de estar entre os que a agenda mostra deste projeto: nada de escrever nota em marco de outro lugar. */
async function exigirMarco(p: { projetoId: string; marcoId: string; userId: string }): Promise<MarcoDaAgenda> {
  if (!(await podeVerConversaDoProjeto(p.userId, p.projetoId))) throw naoEncontrada();
  const entrada = await carregarEntradaDaAgenda(p.projetoId);
  const marco = entrada ? marcosDaAgenda(entrada).find((m) => m.marcoId === p.marcoId) : undefined;
  if (!marco) throw naoEncontrada();
  if (marco.situacao === "entregue") throw new ActionError(MOTIVO_MARCO_ENTREGUE);
  return marco;
}

// ── Nota de motivo ─────────────────────────────────────────────────────────────────────────

export async function salvarNota(p: { projetoId: string; marcoId: string; nota: string; userId: string }): Promise<void> {
  await exigirMarco(p);
  const nota = p.nota.trim();
  if (nota === "") throw new ActionError(MOTIVO_NOTA_VAZIA);
  if (nota.length > NOTA_MAX) throw new ActionError(MOTIVO_NOTA_LONGA);
  const dados = { nota, notaPorId: p.userId, notaEm: new Date() };
  try {
    await prisma.marcoAgendaPortal.upsert({
      where: { marcoId: p.marcoId },
      create: { projetoId: p.projetoId, marcoId: p.marcoId, ...dados },
      update: dados,
    });
  } catch (e) {
    // Duas pessoas criando a linha do mesmo marco ao mesmo tempo: a segunda só atualiza.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    await prisma.marcoAgendaPortal.update({ where: { marcoId: p.marcoId }, data: dados });
  }
}

export async function removerNota(p: { projetoId: string; marcoId: string; userId: string }): Promise<void> {
  await exigirMarco(p);
  const r = await prisma.marcoAgendaPortal.updateMany({
    where: { marcoId: p.marcoId, projetoId: p.projetoId, nota: { not: null } },
    data: { nota: null, notaPorId: null, notaEm: null },
  });
  if (r.count !== 1) throw new ActionError(MOTIVO_SEM_NOTA);
}
