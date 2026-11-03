import "server-only";

import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import type { Prisma } from "@/generated/prisma/client";
import { aplicarOcultos, calcularStatusBriefing, type SecaoBriefing } from "@/modules/inputs/briefing-schema";
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
 * O status do briefing é persistido para a listagem; quando o formulário muda (obrigatória nova,
 * pergunta removida, condição nova, outro modelo padrão), recalcula o dos briefings que o usam — os que o escolheram no
 * projeto e os que herdam dele (pelo cliente ou por ser o padrão). Sem trava de linha de propósito: o próximo
 * salvamento do briefing corrige qualquer corrida.
 */
export async function recalcularStatusDoModelo(
  modeloId: string,
  ehPadrao: boolean,
  secoes: readonly SecaoBriefing[],
  db: Pick<typeof prisma, "briefingProjeto"> = prisma,
) {
  const briefings = await db.briefingProjeto.findMany({
    where: briefingsQueUsam(modeloId, ehPadrao),
    select: { id: true, status: true, respostasJson: true, secoesOcultas: true, camposOcultos: true },
  });
  for (const b of briefings) {
    const novo = calcularStatusBriefing(
      (b.respostasJson ?? {}) as Record<string, unknown>,
      aplicarOcultos(secoes, { secoes: b.secoesOcultas, campos: b.camposOcultos }),
    );
    if (novo !== b.status) await db.briefingProjeto.update({ where: { id: b.id }, data: { status: novo } });
  }
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
      const usam = await tx.briefingProjeto.findMany({ where: briefingsQueUsam(input.id, padrao), select: { id: true }, orderBy: { id: "asc" } });
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
      await recalcularStatusDoModelo(input.id, padrao, v.esquema, tx);
      return total;
    });
  } catch (e) {
    if (ehConflitoDeNome(e)) throw new ActionError(NOME_REPETIDO);
    throw e;
  }
  return { versao: input.versao + 1, migradas };
}
