"use server";

import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { pontoDoMes } from "@/modules/rh/pessoas/queries";

/**
 * Carrega o resumo de ponto do mês de UMA pessoa — sob demanda (a aba Ponto só
 * dispara isto quando aberta), pois `espelhoMes` é a leitura mais cara da ficha.
 * Gate: RH (admin/supervisor/administrativo) ou sócio; leitura, sem auditoria.
 */
export const carregarPontoPessoa = defineAction(
  {
    modulo: "rh",
    acao: "carregar-ponto-pessoa",
    schema: z.object({ id: z.string().min(1) }),
    audit: false,
  },
  async (input, ctx) => {
    // RH/sócio veem de qualquer pessoa; qualquer usuário vê o PRÓPRIO (minha-ficha).
    const podeRH = HR_ADMIN_ROLES.includes(ctx.user.role) || ctx.user.ehSocio === true;
    const ehProprio = input.id === ctx.user.id;
    if (!podeRH && !ehProprio) throw new ActionError("Sem permissão.");
    return pontoDoMes(input.id);
  },
);
