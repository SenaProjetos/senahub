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
export async function recalcularStatusDoModelo(modeloId: string, ehPadrao: boolean, secoes: readonly SecaoBriefing[]) {
  const briefings = await prisma.briefingProjeto.findMany({
    where: briefingsQueUsam(modeloId, ehPadrao),
    select: { id: true, status: true, respostasJson: true, secoesOcultas: true, camposOcultos: true },
  });
  for (const b of briefings) {
    const novo = calcularStatusBriefing(
      (b.respostasJson ?? {}) as Record<string, unknown>,
      aplicarOcultos(secoes, { secoes: b.secoesOcultas, campos: b.camposOcultos }),
    );
    if (novo !== b.status) await prisma.briefingProjeto.update({ where: { id: b.id }, data: { status: novo } });
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
  const antes = validarEsquema(atual.esquema);
  const problemas = problemasDeEvolucao(antes.ok ? antes.esquema : null, v.esquema);
  if (problemas.length > 0) throw new ActionError(problemas[0]);
  const problemaRenomeio = problemaDosRenomeios(input.renomeios, v.esquema);
  if (problemaRenomeio) throw new ActionError(problemaRenomeio);
  let migradas = 0;
  try {
    // Esquema e respostas mudam JUNTOS: se uma migração falhar, o modelo não fica com o texto novo e respostas com o velho.
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
      if (input.renomeios.length === 0) return 0;
      const briefings = await tx.briefingProjeto.findMany({
        where: briefingsQueUsam(input.id, atual.padrao),
        select: { id: true, respostasJson: true },
      });
      let total = 0;
      for (const b of briefings) {
        const m = migrarRespostas((b.respostasJson ?? {}) as Record<string, unknown>, input.renomeios);
        if (m.alteradas === 0) continue;
        await tx.briefingProjeto.update({ where: { id: b.id }, data: { respostasJson: m.respostas as unknown as Prisma.InputJsonValue } });
        total += m.alteradas;
      }
      return total;
    });
  } catch (e) {
    if (ehConflitoDeNome(e)) throw new ActionError(NOME_REPETIDO);
    throw e;
  }
  await recalcularStatusDoModelo(input.id, atual.padrao, v.esquema);
  return { versao: input.versao + 1, migradas };
}
