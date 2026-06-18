"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { CHAVE_CONFIG_FINANCEIRO } from "@/modules/financeiro/config/queries";

const schema = z.object({
  obrigatorios: z.object({
    centro: z.boolean(),
    forma: z.boolean(),
    projeto: z.boolean(),
    contato: z.boolean(),
    observacao: z.boolean(),
  }),
});

/** Salva a configuração do módulo financeiro. Requer financeiro:gerir. */
export const salvarConfigFinanceiro = defineAction(
  {
    modulo: "financeiro",
    recurso: "financeiro",
    permissao: "gerir",
    acao: "salvar-config-financeiro",
    entidade: "ConfigSistema",
    schema,
  },
  async (i) => {
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_CONFIG_FINANCEIRO },
      create: { chave: CHAVE_CONFIG_FINANCEIRO, valor: i },
      update: { valor: i },
    });
    revalidatePath("/financeiro/configuracoes");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro/contas");
    return { ok: true };
  },
);
