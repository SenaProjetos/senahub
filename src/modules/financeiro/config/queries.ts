import "server-only";
import { prisma } from "@/lib/prisma";
import type { CamposObrigatorios } from "@/modules/financeiro/config/validacao";

export const CHAVE_CONFIG_FINANCEIRO = "financeiro.config";

export type ConfigFinanceiro = {
  obrigatorios: CamposObrigatorios;
};

const PADRAO: ConfigFinanceiro = {
  obrigatorios: { centro: false, forma: false, projeto: false, contato: false, observacao: false },
};

/** Config do módulo financeiro (chave/valor em ConfigSistema). Defaults preservam o comportamento atual. */
export async function getConfigFinanceiro(): Promise<ConfigFinanceiro> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_CONFIG_FINANCEIRO } });
  if (!c || typeof c.valor !== "object" || c.valor === null) return PADRAO;
  const v = c.valor as Record<string, unknown>;
  const o = (typeof v.obrigatorios === "object" && v.obrigatorios !== null ? v.obrigatorios : {}) as Record<string, unknown>;
  return {
    obrigatorios: {
      centro: !!o.centro,
      forma: !!o.forma,
      projeto: !!o.projeto,
      contato: !!o.contato,
      observacao: !!o.observacao,
    },
  };
}
