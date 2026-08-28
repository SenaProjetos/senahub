import "server-only";
import { prisma } from "@/lib/prisma";

export const CHAVE_CONFIG_GERACAO_PDF = "documentos.geracaoPdf";

export type ConfigGeracaoPdf = {
  limiteRequisicoes: number;
  janelaMs: number;
};

const PADRAO: ConfigGeracaoPdf = {
  limiteRequisicoes: 12,
  janelaMs: 10 * 60_000, // 10 minutos
};

/** Lê ConfigSistema chave "documentos.geracaoPdf" com rate limiting de PDF.
 * Default: 12 requisições a cada 10 minutos por usuário.
 */
export async function getConfigGeracaoPdf(): Promise<ConfigGeracaoPdf> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_CONFIG_GERACAO_PDF } });
  if (!c || typeof c.valor !== "object" || c.valor === null) return PADRAO;

  const v = c.valor as Record<string, unknown>;
  const num = (x: unknown, fallback: number) =>
    typeof x === "number" && Number.isFinite(x) && x > 0 ? x : fallback;

  return {
    limiteRequisicoes: num(v.limiteRequisicoes, PADRAO.limiteRequisicoes),
    janelaMs: num(v.janelaMs, PADRAO.janelaMs),
  };
}
