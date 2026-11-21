import "server-only";
import { prisma } from "@/lib/prisma";
import { travarBriefingNoTx } from "@/modules/inputs/briefing-service";
import { motivoParaNaoGravar, type CanalBriefing } from "@/modules/inputs/portal-pedido";

/**
 * Grava as respostas das perguntas extras (`InputProjeto`) pelo canal que veio: equipe grava sempre;
 * link e portal obedecem à regra do pedido (`motivoParaNaoGravar`), lida DEPOIS da trava do briefing,
 * na mesma transação que grava. Só pergunta ATIVA do projeto recebe resposta; o que não casou
 * (outro projeto, removida) volta em `ignoradas`.
 */
export async function gravarRespostasExtras(
  projetoId: string,
  respostas: { id: string; resposta: string }[],
  canal: CanalBriefing,
): Promise<{ ok: true; salvas: number; ignoradas: number } | { ok: false; erro: string }> {
  return prisma.$transaction(async (tx) => {
    const { situacao } = await travarBriefingNoTx(tx, projetoId);
    const motivo = motivoParaNaoGravar(situacao, canal);
    if (motivo) return { ok: false as const, erro: motivo };
    let salvas = 0;
    // Uma conexão só na transação: um por um, sem Promise.all.
    for (const r of respostas) {
      const { count } = await tx.inputProjeto.updateMany({
        where: { id: r.id, projetoId, removidoEm: null },
        data: { resposta: r.resposta || null },
      });
      salvas += count;
    }
    return { ok: true as const, salvas, ignoradas: respostas.length - salvas };
  });
}
