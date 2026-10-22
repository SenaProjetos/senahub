import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { divergenciasDeDisciplina } from "./disciplina-linha";
import { herdarResponsaveisNoProjeto } from "./recursos-service";
import { exigirPlanoEditavel } from "./trava-plano-service";

type Db = Prisma.TransactionClient | typeof prisma;

/** Teto de linhas por chamada (o schema da action usa o mesmo). */
export const MAX_LINHAS = 500;

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
  const divergentes = async (db: Db) =>
    divergenciasDeDisciplina(
      await db.eapTarefa.findMany({ where: { projetoId }, select: { id: true, parentId: true, disciplinaId: true, etapaId: true } }),
    ).filter((d) => pedidas.has(d.tarefaId));
  if ((await divergentes(prisma)).length === 0) return { corrigidas: [] };

  await exigirPlanoEditavel(projetoId);
  // Lê DE NOVO dentro da transação e grava só se a linha ainda está na disciplina que se achou errada: edição
  // concorrente (da linha ou do pai) entre a leitura e a gravação não é sobrescrita em silêncio.
  const corrigidas = await prisma.$transaction(
    async (tx) => {
      const feitas: string[] = [];
      for (const d of await divergentes(tx)) {
        const r = await tx.eapTarefa.updateMany({
          where: { id: d.tarefaId, disciplinaId: d.atualId },
          data: { disciplinaId: d.esperadaId, etapaId: d.etapaEsperadaId },
        });
        if (r.count === 1) feitas.push(d.tarefaId);
      }
      return feitas;
    },
    // Até `MAX_LINHAS` updates em sequência: o padrão de 5 s do Prisma não basta para uma EAP grande.
    { timeout: 30_000 },
  );
  if (corrigidas.length > 0) await herdarResponsaveisNoProjeto(prisma, projetoId, corrigidas);
  return { corrigidas };
}
