"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/with-action";
import { removerNotaSchema, salvarNotaSchema } from "./schemas";
import { removerNota, salvarNota } from "./service";

/**
 * Agenda do portal (spec `docs/superpowers/specs/2026-11-23-portal-agenda-contrato-design.md`). Tudo aqui é da EQUIPE:
 * `interno: true` e a audiência da conversa com a coordenação é conferida no serviço. O texto da nota sai ao cliente e não
 * vai para a auditoria (`redact`).
 */

function revalidar(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}/cliente`);
  revalidatePath(`/portal/${projetoId}`);
}

export const salvarNotaDoMarco = defineAction(
  {
    modulo: "portal",
    acao: "agenda-nota-salvar",
    entidade: "MarcoAgendaPortal",
    interno: true,
    schema: salvarNotaSchema,
    redact: ["nota"],
    entidadeId: (_data, input) => input.marcoId,
  },
  async (input, { user }) => {
    await salvarNota({ projetoId: input.projetoId, marcoId: input.marcoId, nota: input.nota, userId: user.id });
    revalidar(input.projetoId);
    return { marcoId: input.marcoId };
  },
);

export const removerNotaDoMarco = defineAction(
  {
    modulo: "portal",
    acao: "agenda-nota-remover",
    entidade: "MarcoAgendaPortal",
    interno: true,
    schema: removerNotaSchema,
    entidadeId: (_data, input) => input.marcoId,
  },
  async (input, { user }) => {
    await removerNota({ projetoId: input.projetoId, marcoId: input.marcoId, userId: user.id });
    revalidar(input.projetoId);
    return { marcoId: input.marcoId };
  },
);
