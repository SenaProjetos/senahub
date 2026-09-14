import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Dados da empresa pro timbrado dos PDFs gerados pelo sistema (holerite CLT — plano
 * 2026-09-13-folha-clt-import-assinatura.md, achado ao vivo no primeiro import real: o PDF saía
 * sem nenhuma identificação do empregador). Guardado em `ConfigSistema` (key/value já existente)
 * em vez de tabela nova — é um registro só, sem histórico, sem relação com outra entidade.
 */
export const CHAVE_DADOS_EMPRESA = "empresa.dados";

export type DadosEmpresa = {
  razaoSocial: string;
  cnpj: string | null;
  endereco: string | null;
  /** Caminho relativo no storage (`lib/storage.ts`), não a URL pública. `null` = sem logo. */
  logoPath: string | null;
};

function normalizar(valor: unknown): DadosEmpresa | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Record<string, unknown>;
  if (typeof v.razaoSocial !== "string" || !v.razaoSocial.trim()) return null;
  return {
    razaoSocial: v.razaoSocial,
    cnpj: typeof v.cnpj === "string" && v.cnpj.trim() ? v.cnpj : null,
    endereco: typeof v.endereco === "string" && v.endereco.trim() ? v.endereco : null,
    logoPath: typeof v.logoPath === "string" && v.logoPath.trim() ? v.logoPath : null,
  };
}

/** `null` quando ninguém preencheu ainda — quem usa (ex.: PDF do holerite) trata como "sem timbrado". */
export async function dadosEmpresa(): Promise<DadosEmpresa | null> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_DADOS_EMPRESA } });
  return normalizar(c?.valor);
}
