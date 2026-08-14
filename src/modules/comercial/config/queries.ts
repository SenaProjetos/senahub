import "server-only";
import { prisma } from "@/lib/prisma";
import {
  CONFIG_COMERCIAL_PADRAO,
  parseConfigComercial,
  type ConfigComercial,
} from "@/modules/comercial/config/padroes";

/**
 * Configuração do módulo Comercial em `ConfigSistema` (F1.7) — mesmo padrão de
 * `financeiro/config`, `financeiro/aprovacao`, `licitacoes/config` e `rh/encargos`.
 *
 * A chave **não é semeada**: enquanto ninguém editar na tela, ela simplesmente não existe e os
 * defaults do código valem. Isso evita o problema clássico de semear default — mudar o padrão no
 * código não teria efeito nos bancos onde o seed já gravou o valor antigo.
 */
export const CHAVE_CONFIG_COMERCIAL = "comercial.config";

/** Parâmetros configuráveis do Comercial. Cai nos defaults quando não há nada gravado. */
export async function getConfigComercial(): Promise<ConfigComercial> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_CONFIG_COMERCIAL } });
  if (!c) return CONFIG_COMERCIAL_PADRAO;
  return parseConfigComercial(c.valor);
}
