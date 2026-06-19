import "server-only";
import { prisma } from "@/lib/prisma";
import { CHAVE_CONFIG_LICITACOES, CONFIG_LICITACOES_PADRAO, parseConfigLicitacoes, type ConfigLicitacoes } from "@/modules/licitacoes/config/defaults";

/** Config do módulo de licitações (chave/valor em ConfigSistema). Defaults preservam comportamento seguro. */
export async function getConfigLicitacoes(): Promise<ConfigLicitacoes> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_CONFIG_LICITACOES } });
  if (!c || typeof c.valor !== "object" || c.valor === null) return { ...CONFIG_LICITACOES_PADRAO };
  return parseConfigLicitacoes(c.valor);
}

export { CHAVE_CONFIG_LICITACOES };
