import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  calcularStatusBriefing,
  mesclarRespostasVisiveis,
  secoesDoProjeto,
  type StatusBriefing,
} from "@/modules/inputs/briefing-schema";
import { aplicarFormatosDoBriefing } from "@/modules/inputs/briefing-formato";
import { resolverModeloDoProjeto } from "@/modules/inputs/modelo-queries";

type Resultado =
  | { ok: true; status: StatusBriefing; statusAnterior: StatusBriefing | null }
  | { ok: false; erro: string; campos: Record<string, string> };

/**
 * Grava as respostas do briefing (no formulário do MODELO do projeto) — o caminho único da equipe (`salvarBriefing`) e do link
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
      select: { respostasJson: true, status: true, secoesOcultas: true, camposOcultos: true, preenchidoEm: true, modeloId: true },
    });
    const anteriores = (gravado.respostasJson ?? {}) as Record<string, unknown>;
    const modelo = await resolverModeloDoProjeto(projetoId, gravado.modeloId, tx);
    // O que o projeto mostra (disciplinas + ocultações): obrigatória de seção que ele não mostra não segura o status.
    const disciplinas = (await tx.disciplina.findMany({ where: { projetoId }, select: { disciplinaTextoLegado: true } })).map((d) => d.disciplinaTextoLegado);
    const visiveis = secoesDoProjeto(modelo.secoes, disciplinas, { secoes: gravado.secoesOcultas, campos: gravado.camposOcultos });
    const formatos = aplicarFormatosDoBriefing(mesclarRespostasVisiveis(anteriores, enviadas, visiveis), anteriores, modelo.secoes);
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
