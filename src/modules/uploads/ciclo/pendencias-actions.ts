"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/with-action";
import { desfazerDispensaNoBanco, dispensarNoBanco } from "./pendencias-service";
import { desfazerDispensaSchema, dispensarSchema } from "./pendencias-schemas";

/**
 * Ações da tela de pendências documentais. Gate = o mesmo da tela e da audiência do aviso
 * (`notificacoes:gestao`, só gente de dentro). Uma pendência por chamada: o lote da tela repete a ação
 * no navegador (`useLote`). Nenhuma escreve no banco por conta própria — vão ao serviço.
 */

export const dispensarPendencia = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-dispensar-pendencia",
    recurso: "notificacoes",
    permissao: "gestao",
    interno: true,
    entidade: "DispensaPendenciaCiclo",
    schema: dispensarSchema,
    entidadeId: (_d, input) => input.alvoId,
  },
  async (input, { user }) => {
    await dispensarNoBanco({ alvoId: input.alvoId, tipo: input.tipo, chave: input.chave, motivo: input.motivo, userId: user.id });
    revalidatePath("/arquivos/pendencias");
    return { ok: true as const };
  },
);

export const desfazerDispensaPendencia = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-desfazer-dispensa",
    recurso: "notificacoes",
    permissao: "gestao",
    interno: true,
    entidade: "DispensaPendenciaCiclo",
    schema: desfazerDispensaSchema,
    entidadeId: (_d, input) => input.alvoId,
  },
  async (input, { user }) => {
    await desfazerDispensaNoBanco({ alvoId: input.alvoId, tipo: input.tipo, userId: user.id });
    revalidatePath("/arquivos/pendencias");
    return { ok: true as const };
  },
);
