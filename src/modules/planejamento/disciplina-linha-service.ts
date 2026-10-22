import "server-only";

import { prisma } from "@/lib/prisma";
import { divergenciasDeDisciplina } from "./disciplina-linha";
import { herdarResponsaveisNoProjeto } from "./recursos-service";
import { exigirPlanoEditavel } from "./trava-plano-service";

/**
 * Passa para a disciplina (e a fase) do agrupamento as linhas que divergem dela — o botão do achado
 * `disciplina_diferente_do_agrupamento`. Separado da action para o smoke alcançar a regra sem sessão.
 *
 * A divergência é RECALCULADA aqui, do banco: a lista que a tela mostrava pode estar velha (a linha já foi
 * corrigida, ou alguém mexeu na árvore depois). Só corrige o que ainda diverge, e dentre os ids pedidos.
 * Quem já está atribuído à linha continua: tirar gente automaticamente seria destrutivo; a linha que ficou SEM
 * ninguém recebe o responsável da disciplina nova (D22). A guarda do plano só roda quando há o que gravar —
 * ela marca a revisão como alterada, e não pode marcar por uma correção que não aconteceu.
 */
export async function alinharDisciplinasNoBanco(
  projetoId: string,
  tarefaIds: readonly string[],
): Promise<{ corrigidas: string[] }> {
  const pedidas = new Set(tarefaIds);
  const nos = await prisma.eapTarefa.findMany({
    where: { projetoId },
    select: { id: true, parentId: true, disciplinaId: true, etapaId: true },
  });
  const aCorrigir = divergenciasDeDisciplina(nos).filter((d) => pedidas.has(d.tarefaId));
  if (aCorrigir.length === 0) return { corrigidas: [] };

  await exigirPlanoEditavel(projetoId);
  await prisma.$transaction(async (tx) => {
    for (const d of aCorrigir) {
      await tx.eapTarefa.update({ where: { id: d.tarefaId }, data: { disciplinaId: d.esperadaId, etapaId: d.etapaEsperadaId } });
    }
  });
  const corrigidas = aCorrigir.map((d) => d.tarefaId);
  await herdarResponsaveisNoProjeto(prisma, projetoId, corrigidas);
  return { corrigidas };
}
