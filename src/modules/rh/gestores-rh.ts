import "server-only";
import { prisma } from "@/lib/prisma";
import { whereAudiencia } from "@/lib/audiencias";
import { notificar } from "@/lib/notificar";

/**
 * Quem "é do RH" para a regra de quem decide (`quem-decide.ts`): a audiência `rh_gestao`, que
 * espelha `permissaoEfetiva(…, "rh", "gerir")` (superusuário incluído). Uma definição só — a
 * mesma que decide o gate `gereRh` das ações.
 */
export async function idsDoRh(): Promise<string[]> {
  const linhas = await prisma.user.findMany({ where: whereAudiencia("rh_gestao"), select: { id: true } });
  return linhas.map((l) => l.id);
}

export async function ehDoRh(userId: string): Promise<boolean> {
  return (await prisma.user.count({ where: { ...whereAudiencia("rh_gestao"), id: userId } })) > 0;
}

type Aviso = { titulo: string; corpo: string; href: string };

/**
 * Notificação de melhor esforço depois de uma gravação já feita: um erro aqui não pode virar
 * falha na tela (a pessoa repetiria a ação) nem impedir o que vem depois (impacto, banco de horas).
 */
export async function notificarSemFalhar(userId: string, aviso: Aviso): Promise<void> {
  try {
    await notificar(userId, aviso);
  } catch (e) {
    console.error("[rh] falha ao notificar", userId, e);
  }
}

/**
 * Avisa quem pode DECIDIR um pedido de `donoId`: os administradores quando o dono é do RH (um
 * colega do RH não decide), senão quem administra RH (`rh_admin`, como sempre foi). O próprio
 * dono nunca recebe o aviso do próprio pedido. Nunca lança: o pedido já está gravado, e cada
 * destino é avisado à parte (uma falha não deixa os outros sem aviso).
 */
export async function notificarQuemDecide(donoId: string, aviso: Aviso): Promise<void> {
  try {
    const audiencia = (await ehDoRh(donoId)) ? "administradores" : "rh_admin";
    const destinos = await prisma.user.findMany({
      where: { ...whereAudiencia(audiencia), id: { not: donoId } },
      select: { id: true },
    });
    if (destinos.length === 0) {
      // Ex.: o único administrador pedindo a própria ausência — ele mesmo decide na fila.
      console.warn("[rh] pedido sem ninguém para avisar", { donoId, audiencia });
    }
    for (const d of destinos) await notificarSemFalhar(d.id, aviso);
  } catch (e) {
    console.error("[rh] falha ao avisar quem decide", donoId, e);
  }
}
