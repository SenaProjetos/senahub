import "server-only";

import { ActionError } from "@/lib/action-error";
import type { ActionContext } from "@/lib/with-action";
import { projetoVisivel } from "./queries";

type Viewer = ActionContext["user"];

/**
 * Escopo de dados nas escritas do planejamento: a permissão (`planejamento:gerir`, `cronograma:executado`…) diz O QUE a
 * pessoa pode fazer; o escopo diz EM QUAL projeto. Sem esta checagem, quem tem a permissão mas não enxerga um projeto
 * mexia no cronograma dele chamando a action com o id. Fora do escopo é "não encontrado" (não diz que o projeto existe).
 */
export async function exigirProjetoNoEscopo(user: Viewer, projetoId: string): Promise<void> {
  if (!(await projetoVisivel(user, projetoId))) throw new ActionError("Projeto não encontrado.");
}

/**
 * Embrulha o HANDLER de um `defineAction` com a checagem de escopo. Se o projeto não se resolve (a linha não existe),
 * roda o handler puro — é ele quem responde o erro certo ao usuário. Em arquivo "use server", passe `projetoDe` como
 * função ASYNC (`async (i) => i.projetoId`): o compilador do Next recusa função síncrona solta como argumento ali
 * ("Server Actions must be async functions") — e tsc/lint não pegam.
 */
export function noEscopoDoProjeto<I, R>(
  projetoDe: (i: I) => string | Promise<string>,
  handler: (i: I, ctx: ActionContext) => Promise<R>,
): (i: I, ctx: ActionContext) => Promise<R> {
  return async (i, ctx) => {
    let projetoId: string;
    try {
      projetoId = await projetoDe(i);
    } catch {
      return handler(i, ctx);
    }
    await exigirProjetoNoEscopo(ctx.user, projetoId);
    return handler(i, ctx);
  };
}
