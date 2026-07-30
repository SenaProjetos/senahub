"use server";

import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { can } from "@/lib/permissions";
import { pontoDoMes } from "@/modules/rh/pessoas/queries";

/**
 * Carrega o resumo de ponto do mês de UMA pessoa — sob demanda (a aba Ponto só
 * dispara isto quando aberta), pois `espelhoMes` é a leitura mais cara da ficha.
 * Gate: próprio usuário ou `ponto:espelho_equipe`; leitura, sem auditoria.
 */
export const carregarPontoPessoa = defineAction(
  {
    modulo: "rh",
    acao: "carregar-ponto-pessoa",
    schema: z.object({ id: z.string().min(1) }),
    audit: false,
  },
  async (input, ctx) => {
    // Qualquer usuário vê o próprio. Para terceiros, usa o mesmo gate da página/resumo.
    const ehProprio = input.id === ctx.user.id;
    const podeRH = ehProprio ? false : await can(ctx.user.role, "ponto", "espelho_equipe");
    if (!podeRH && !ehProprio) throw new ActionError("Sem permissão.");
    return pontoDoMes(input.id);
  },
);
