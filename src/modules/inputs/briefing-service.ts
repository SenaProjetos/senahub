import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  aplicarOcultos,
  BRIEFING_SCHEMA,
  calcularStatusBriefing,
  mesclarRespostasVisiveis,
  type StatusBriefing,
} from "@/modules/inputs/briefing-schema";
import { aplicarFormatosDoBriefing } from "@/modules/inputs/briefing-formato";

type Resultado =
  | { ok: true; status: StatusBriefing; statusAnterior: StatusBriefing | null }
  | { ok: false; erro: string; campos: Record<string, string> };

/**
 * Grava as respostas do briefing — o caminho único da equipe (`salvarBriefing`) e do link
 * público. Só os campos VISÍVEIS no projeto mudam (o oculto é guardado, nunca sobrescrito nem
 * apagado pelo envio); e-mail/telefone mudado passa pela validação de formato; o status é
 * calculado sobre o que continua visível. Trava a linha: ocultar e salvar ao mesmo tempo não
 * deixam um status defasado.
 */
export async function gravarRespostasBriefing(
  projetoId: string,
  enviadas: Record<string, unknown>,
  preenchidoPor: string,
): Promise<Resultado> {
  return prisma.$transaction(async (tx) => {
    await tx.briefingProjeto.createMany({ data: [{ projetoId }], skipDuplicates: true });
    await tx.$queryRaw`SELECT 1 FROM "briefing_projeto" WHERE "projetoId" = ${projetoId} FOR UPDATE`;
    const gravado = await tx.briefingProjeto.findUniqueOrThrow({
      where: { projetoId },
      select: { respostasJson: true, status: true, secoesOcultas: true, camposOcultos: true, preenchidoEm: true },
    });
    const anteriores = (gravado.respostasJson ?? {}) as Record<string, unknown>;
    const visiveis = aplicarOcultos(BRIEFING_SCHEMA, { secoes: gravado.secoesOcultas, campos: gravado.camposOcultos });
    const formatos = aplicarFormatosDoBriefing(mesclarRespostasVisiveis(anteriores, enviadas, visiveis), anteriores);
    if (!formatos.ok) return { ok: false, erro: formatos.erro, campos: formatos.campos };
    const status = calcularStatusBriefing(formatos.respostas, visiveis);
    await tx.briefingProjeto.update({
      where: { projetoId },
      data: {
        respostasJson: formatos.respostas as unknown as Prisma.InputJsonValue,
        status,
        preenchidoPor,
        preenchidoEm: new Date(),
      },
    });
    // Linha recém-criada aqui (nunca preenchida) não tinha status de verdade.
    const statusAnterior = gravado.preenchidoEm ? (gravado.status as StatusBriefing) : null;
    return { ok: true, status, statusAnterior };
  });
}
