import "server-only";
import { prisma } from "@/lib/prisma";
import type { CamposObrigatorios } from "@/modules/financeiro/config/validacao";
import { ALIQUOTAS_ZERO, type Aliquotas } from "@/modules/financeiro/fechamento/calculo";

export const CHAVE_CONFIG_FINANCEIRO = "financeiro.config";
export const CHAVE_ALIQUOTAS = "financeiro.aliquotas";
export const CHAVE_EXCLUSAO = "financeiro.exclusao";

/** Config de senha de exclusão com o hash (uso interno das actions). */
export async function getExclusaoCompleto(): Promise<{ exigir: boolean; hash: string | null }> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_EXCLUSAO } });
  if (!c || typeof c.valor !== "object" || c.valor === null) return { exigir: false, hash: null };
  const v = c.valor as Record<string, unknown>;
  return { exigir: !!v.exigir, hash: typeof v.hash === "string" && v.hash.length > 0 ? v.hash : null };
}

/** Se a exclusão de lançamentos exige senha (para a UI). */
export async function getConfigExclusao(): Promise<{ exigir: boolean }> {
  return { exigir: (await getExclusaoCompleto()).exigir };
}

/** Alíquotas (%) de retenção/desconto do fechamento mensal. Default = zeros. */
export async function getAliquotas(): Promise<Aliquotas> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_ALIQUOTAS } });
  if (!c || typeof c.valor !== "object" || c.valor === null) return ALIQUOTAS_ZERO;
  const v = c.valor as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  return { iss: num(v.iss), inss: num(v.inss), ir: num(v.ir), desconto: num(v.desconto) };
}

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
