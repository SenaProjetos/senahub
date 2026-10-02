"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { CHAVE_CONFIG_AVISOS, configAvisosSchema } from "@/modules/financeiro/avisos/regras";
import { getConfigAvisos } from "@/modules/financeiro/avisos/service";

/**
 * Liga e desliga os avisos do Financeiro (cobrança ao cliente antes/no dia/depois e contas a pagar vencendo).
 * Quem muda isto decide se o CLIENTE recebe e-mail: só `financeiro:gerir`.
 */
export const salvarConfigAvisos = defineAction(
  {
    modulo: "financeiro",
    recurso: "financeiro",
    permissao: "gerir",
    acao: "salvar-config-avisos",
    entidade: "ConfigSistema",
    schema: configAvisosSchema,
    capturarAntes: () => getConfigAvisos(),
  },
  async (i) => {
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_CONFIG_AVISOS },
      create: { chave: CHAVE_CONFIG_AVISOS, valor: i },
      update: { valor: i },
    });
    revalidatePath("/financeiro/configuracoes");
    return i;
  },
);
