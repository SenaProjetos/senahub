"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { CHAVE_CONFIG_RETENCOES, diasDeVencimentoDasRetencoes } from "@/modules/financeiro/lancamentos/retencoes-service";

const dia = z.number().int().min(1, "Dia entre 1 e 31.").max(31, "Dia entre 1 e 31.");

/**
 * C4: dia do mês seguinte ao pagamento da nota em que vence a conta de cada imposto retido (padrão do contador: ISS 10,
 * os demais 15). Vale para as contas que nascerem daqui em diante — as que já existem mantêm o vencimento.
 */
export const salvarDiasRetencoes = defineAction(
  {
    modulo: "financeiro",
    recurso: "financeiro",
    permissao: "gerir",
    acao: "salvar-vencimento-impostos-retidos",
    entidade: "ConfigSistema",
    schema: z.object({ iss: dia, irrf: dia, inss: dia, pis: dia, cofins: dia, csll: dia }),
    capturarAntes: () => diasDeVencimentoDasRetencoes(),
  },
  async (i) => {
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_CONFIG_RETENCOES },
      create: { chave: CHAVE_CONFIG_RETENCOES, valor: i },
      update: { valor: i },
    });
    revalidatePath("/financeiro/configuracoes");
    revalidatePath("/financeiro/contas");
    return i;
  },
);
