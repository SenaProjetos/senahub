import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Chaves de configuração do módulo `juridico` em `ConfigSistema` — mesmo padrão de
 * `rh/encargos` (`CHAVE_DEDUCAO_DEP`) e `comercial/config`: a chave não é semeada, o default
 * vive no código; só nasce uma linha quando alguém editar (ainda não há tela pra isso).
 */
export const CHAVE_DIAS_AVISO_VENCIMENTO_CONTRATO = "juridico.diasAvisoVencimentoContrato";

/** Quantos dias antes do vencimento o alerta de contrato de equipe dispara. Default: 30. */
export async function diasAvisoVencimentoContrato(): Promise<number> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_DIAS_AVISO_VENCIMENTO_CONTRATO } });
  return typeof c?.valor === "number" && c.valor > 0 ? c.valor : 30;
}

export const CHAVE_LIMITE_APROVACAO_CONTRATO = "juridico.limiteAprovacaoContrato";

/**
 * Valor (R$) de contrato de equipe a partir do qual sair de "rascunho" exige sócio
 * (`lib/aprovacao.ts` `devePassarPorAprovacao`, Fase H4). Default 0 = alçada DESLIGADA
 * (`devePassarPorAprovacao` só passa a exigir quando `limite > 0`) — decidido 2026-08-26,
 * ninguém é bloqueado até o valor real ser configurado.
 */
export async function limiteAprovacaoContrato(): Promise<number> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_LIMITE_APROVACAO_CONTRATO } });
  return typeof c?.valor === "number" ? c.valor : 0;
}
