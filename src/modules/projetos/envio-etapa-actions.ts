"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { INTERNAL_ROLES } from "@/lib/roles";
import { desfazerEnvioEtapa, enviarEtapaParaAnalise } from "./envio-etapa-service";

/**
 * Botão do card: "Enviei os documentos desta etapa para análise" (áudio do dono, 2026-10-10). Sem
 * permissão fina: o gate é ser RESPONSÁVEL da disciplina, conferido no serviço — vale para o PJ,
 * que não tem `projetos:gerir`.
 */
const base = { modulo: "projetos", roles: INTERNAL_ROLES, entidade: "DisciplinaEtapa" } as const;
const schema = z.object({ etapaId: z.string().min(1) });

export const enviarEtapaAnalise = defineAction(
  { ...base, acao: "enviar-etapa-analise", schema, entidadeId: (_d, i) => i.etapaId },
  async (i, { user }) => {
    const r = await enviarEtapaParaAnalise({ etapaId: i.etapaId, userId: user.id });
    revalidatePath(`/projetos/${r.projetoId}`);
    return r;
  },
);

export const desfazerEnvioEtapaAnalise = defineAction(
  { ...base, acao: "desfazer-envio-etapa-analise", schema, entidadeId: (_d, i) => i.etapaId },
  async (i, { user }) => {
    const r = await desfazerEnvioEtapa({ etapaId: i.etapaId, userId: user.id });
    revalidatePath(`/projetos/${r.projetoId}`);
    return r;
  },
);
