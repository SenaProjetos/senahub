import { z } from "zod";
import { LIMITE_TEXTO_RESPOSTA } from "@/modules/inputs/briefing-schema";

/**
 * Schemas das ações do briefing no portal. Ficam FORA do arquivo "use server": um `.refine` escrito dentro de
 * `defineAction` passa em vitest/lint/tsc e só quebra no `next build`.
 */

const respostasDoBriefing = z
  .record(z.string().max(64, "Resposta inválida."), z.unknown())
  .refine((r) => Object.keys(r).length <= 500, "Respostas demais neste envio. Recarregue a página e tente de novo.");

export const salvarBriefingDoPortalSchema = z.object({
  projetoId: z.string().min(1, "Projeto não informado.").max(64, "Projeto inválido."),
  respostas: respostasDoBriefing,
});

export const responderPerguntasDoPortalSchema = z.object({
  projetoId: z.string().min(1, "Projeto não informado.").max(64, "Projeto inválido."),
  respostas: z
    .array(
      z.object({
        id: z.string().max(64, "Pergunta inválida."),
        resposta: z.string().max(LIMITE_TEXTO_RESPOSTA, "Resposta longa demais."),
      }),
    )
    .max(200, "Respostas demais neste envio. Recarregue a página e tente de novo."),
});
