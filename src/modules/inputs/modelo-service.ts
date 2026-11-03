import "server-only";

import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import type { Prisma } from "@/generated/prisma/client";
import { recalcularBriefingsDosProjetos } from "@/modules/inputs/briefing-status";
import { briefingsQueUsam } from "@/modules/inputs/modelo-queries";
import { migrarRespostas, problemaDosRenomeios, problemasDeEvolucao, validarEsquema, type Renomeio } from "@/modules/inputs/modelo-schema";

/**
 * Regras de gravação do modelo de formulário, compartilhadas pela action e pelo smoke (sem Next/HTTP).
 */

export const NOME_REPETIDO = "Já existe um modelo com este nome.";
export const MOTIVO_OUTRA_PESSOA = "Outra pessoa salvou este modelo enquanto você editava. Recarregue a página e refaça a alteração.";

export function ehConflitoDeNome(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/**
 * Salva o modelo INTEIRO: valida o esquema (inclusive as condições), a regra de evolução de tipo e os renomeios de
 * opção; grava esquema e migração das respostas NA MESMA transação (trava otimista por `versao`); e recalcula o status.
 * Devolve a nova versão e quantas respostas acompanharam o texto novo de uma opção.
 */
export async function salvarModeloNoBanco(input: {
  id: string;
  versao: number;
  nome: string;
  descricao?: string;
  esquema: unknown[];
  renomeios: readonly Renomeio[];
}): Promise<{ versao: number; migradas: number }> {
  const v = validarEsquema(input.esquema);
  if (!v.ok) throw new ActionError(v.erro);
  const atual = await prisma.modeloBriefing.findUnique({ where: { id: input.id } });
  if (!atual) throw new ActionError("Modelo não encontrado.");
  // Versão velha primeiro: a explicação certa é "outra pessoa salvou", não uma regra de tipo sobre o que ela já mudou.
  if (atual.versao !== input.versao) throw new ActionError(MOTIVO_OUTRA_PESSOA);
  const antes = validarEsquema(atual.esquema);
  const problemas = problemasDeEvolucao(antes.ok ? antes.esquema : null, v.esquema);
  if (problemas.length > 0) throw new ActionError(problemas[0]);
  const problemaRenomeio = problemaDosRenomeios(input.renomeios, v.esquema, antes.ok ? antes.esquema : null);
  if (problemaRenomeio) throw new ActionError(problemaRenomeio);
  let migradas = 0;
  try {
    // Esquema, respostas e status mudam JUNTOS: se algo falhar, o modelo não fica com o texto novo e respostas com o velho.
    migradas = await prisma.$transaction(async (tx) => {
      const { count } = await tx.modeloBriefing.updateMany({
        where: { id: input.id, versao: input.versao },
        data: {
          nome: input.nome,
          descricao: input.descricao || null,
          esquema: v.esquema as unknown as Prisma.InputJsonValue,
          versao: { increment: 1 },
        },
      });
      if (count !== 1) throw new ActionError(MOTIVO_OUTRA_PESSOA);
      // `padrao` lido AQUI: se o modelo virou o padrão agora há pouco, quem herda dele também entra.
      const { padrao } = await tx.modeloBriefing.findUniqueOrThrow({ where: { id: input.id }, select: { padrao: true } });
      const usam = await tx.briefingProjeto.findMany({ where: briefingsQueUsam(input.id, padrao), select: { id: true, projetoId: true }, orderBy: { id: "asc" } });
      const ids = usam.map((b) => b.id);
      // Trava as linhas (mesma trava do salvamento do briefing): uma resposta que chega no meio não é sobrescrita por cópia velha.
      if (ids.length > 0) await tx.$queryRaw`SELECT 1 FROM "briefing_projeto" WHERE "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`;
      let total = 0;
      if (input.renomeios.length > 0) {
        const briefings = await tx.briefingProjeto.findMany({ where: { id: { in: ids } }, select: { id: true, respostasJson: true } });
        for (const b of briefings) {
          const m = migrarRespostas((b.respostasJson ?? {}) as Record<string, unknown>, input.renomeios);
          if (m.alteradas === 0) continue;
          await tx.briefingProjeto.update({ where: { id: b.id }, data: { respostasJson: m.respostas as unknown as Prisma.InputJsonValue } });
          total += m.alteradas;
        }
      }
      // O status é persistido para a tela; formulário mudou (obrigatória nova, pergunta removida, condição nova), quem usa o
      // modelo é recalculado — sobre as disciplinas e ocultações de cada projeto. Sem zerar nada: o modelo é o MESMO.
      if (ids.length > 0) {
        await recalcularBriefingsDosProjetos(tx, usam.map((b) => b.projetoId));
      }
      return total;
    }, { timeout: 30_000 });
  } catch (e) {
    if (ehConflitoDeNome(e)) throw new ActionError(NOME_REPETIDO);
    throw e;
  }
  return { versao: input.versao + 1, migradas };
}
