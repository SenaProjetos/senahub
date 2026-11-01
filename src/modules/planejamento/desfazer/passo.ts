import "server-only";

import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import type { ActionContext } from "@/lib/with-action";
import { comPasso } from "./service";

/**
 * Liga uma Server Action do plano ao desfazer (Ctrl+Z): embrulha o HANDLER do `defineAction` (sessão, permissão,
 * validação e auditoria seguem como estavam) para que a mudança vire um passo da pilha da pessoa. Se o projeto ou o
 * rótulo não se resolvem (a linha não existe), roda o handler puro — é ele quem responde o erro certo ao usuário.
 */
export function comPassoDaAction<I, R>(
  cfg: { projetoDe: (i: I) => Promise<string>; rotulo: (i: I) => string | Promise<string> },
  handler: (i: I, ctx: ActionContext) => Promise<R>,
): (i: I, ctx: ActionContext) => Promise<R> {
  return async (i, ctx) => {
    let projetoId: string;
    let rotulo: string;
    try {
      projetoId = await cfg.projetoDe(i);
      rotulo = await cfg.rotulo(i);
    } catch {
      return handler(i, ctx);
    }
    return comPasso({ projetoId, userId: ctx.user.id, rotulo }, () => handler(i, ctx));
  };
}

/** O projeto de uma linha da EAP. */
export async function projetoDaLinha(tarefaId: string): Promise<string> {
  const t = await prisma.eapTarefa.findUnique({ where: { id: tarefaId }, select: { projetoId: true } });
  if (!t) throw new ActionError("Tarefa não encontrada.");
  return t.projetoId;
}

/** O projeto de uma atribuição (pessoa/horas de uma linha). */
export async function projetoDaAtribuicao(atribuicaoId: string): Promise<string> {
  const a = await prisma.eapAtribuicao.findUnique({ where: { id: atribuicaoId }, select: { tarefa: { select: { projetoId: true } } } });
  if (!a) throw new ActionError("Atribuição não encontrada.");
  return a.tarefa.projetoId;
}

/** Rótulo `Verbo "nome da linha"`, com o nome lido ANTES de a ação rodar (a exclusão apaga a linha). */
export const rotuloDaLinha = (verbo: string) => async <I extends { id: string }>(i: I): Promise<string> => {
  const t = await prisma.eapTarefa.findUnique({ where: { id: i.id }, select: { nome: true } });
  return t ? `${verbo} "${t.nome}"` : verbo;
};
