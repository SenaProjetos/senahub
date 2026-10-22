import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { divergenciasDeDisciplina, faseQueAcompanha } from "./disciplina-linha";
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
 * A fase da linha acompanha a disciplina nova só se esta a tem cadastrada (`faseQueAcompanha`). Agrupamento nunca é
 * corrigido (veja `divergenciasDeDisciplina`). Quem já está atribuído à linha continua: tirar gente automaticamente seria destrutivo; a linha que ficou SEM
 * ninguém recebe o responsável da disciplina nova (D22). A guarda do plano só roda quando há o que gravar —
 * ela marca a revisão como alterada, e não pode marcar por uma correção que não aconteceu.
 */
export async function alinharDisciplinasNoBanco(
  projetoId: string,
  tarefaIds: readonly string[],
): Promise<{ corrigidas: string[] }> {
  const pedidas = new Set(tarefaIds);
  const divergentes = async (db: Db) => {
    const linhas = await db.eapTarefa.findMany({ where: { projetoId }, select: { id: true, parentId: true, disciplinaId: true, etapaId: true } });
    const pais = new Set(linhas.map((l) => l.parentId).filter((p): p is string => p != null));
    return {
      proprias: new Map(linhas.map((l) => [l.id, l.etapaId])),
      lista: divergenciasDeDisciplina(linhas.map((l) => ({ ...l, ehResumo: pais.has(l.id) }))).filter((d) => pedidas.has(d.tarefaId)),
    };
  };
  if ((await divergentes(prisma)).lista.length === 0) return { corrigidas: [] };

  await exigirPlanoEditavel(projetoId);
  // Lê DE NOVO dentro da transação e grava só se a linha ainda está na disciplina que se achou errada: edição
  // concorrente (da linha ou do pai) entre a leitura e a gravação não é sobrescrita em silêncio.
  const corrigidas = await prisma.$transaction(
    async (tx) => {
      const feitas: string[] = [];
      const { proprias, lista } = await divergentes(tx);
      const fasesDe = new Map<string, Set<string>>();
      for (const d of lista) {
        if (!fasesDe.has(d.esperadaId)) {
          const rows = await tx.disciplinaEtapa.findMany({ where: { disciplinaId: d.esperadaId }, select: { etapaId: true } });
          fasesDe.set(d.esperadaId, new Set(rows.map((r) => r.etapaId)));
        }
        // A fase da própria linha fica se a disciplina nova a tem (o marco continua ligado à etapa); senão, a do
        // agrupamento, se a disciplina a tem; senão nenhuma — como o editor da linha ao trocar de disciplina.
        const etapaId = faseQueAcompanha([proprias.get(d.tarefaId) ?? null, d.etapaEsperadaId], fasesDe.get(d.esperadaId)!);
        const r = await tx.eapTarefa.updateMany({
          where: { id: d.tarefaId, disciplinaId: d.atualId },
          data: { disciplinaId: d.esperadaId, etapaId },
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

/** A fase com que uma linha NOVA nasce sob um agrupamento: a dele, se a disciplina a tem cadastrada. */
export async function faseDaLinhaNova(db: Db, disciplinaId: string | null, etapaDoPai: string | null): Promise<string | null> {
  if (!disciplinaId || !etapaDoPai) return null;
  const rows = await db.disciplinaEtapa.findMany({ where: { disciplinaId }, select: { etapaId: true } });
  return faseQueAcompanha([etapaDoPai], new Set(rows.map((r) => r.etapaId)));
}
