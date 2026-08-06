import "server-only";
import { prisma } from "@/lib/prisma";
import type { LinkPublicoCertidoes } from "@/generated/prisma/client";
import { statusCertidao } from "./service";

/**
 * Link público (sem login) de certidões — somente ver + baixar. Fonte única usada pela
 * página pública (`/p/certidoes/[token]`) e pelas rotas de download (`/api/p/certidoes/[token]/...`).
 *
 * Regras da muralha do link (mesma forma de `modules/projetos/arquivos/link-publico.ts`):
 *  - só certidões na whitelist `certidaoIds` (vazio = nenhuma exposta);
 *  - `ativo=false` revoga na hora; `expiraEm` no passado desliga o link.
 */

export function linkVigente(link: Pick<LinkPublicoCertidoes, "ativo" | "expiraEm">): boolean {
  if (!link.ativo) return false;
  if (link.expiraEm && link.expiraEm.getTime() <= Date.now()) return false;
  return true;
}

export type CertidaoPublica = {
  id: string;
  tipo: string;
  descricao: string | null;
  validade: string;
  status: ReturnType<typeof statusCertidao>;
  arquivoNome: string | null;
};

/** Conteúdo visível de um link por token: só se vigente. `null` = indisponível. */
export async function conteudoPublicoPorToken(token: string): Promise<CertidaoPublica[] | null> {
  const link = await prisma.linkPublicoCertidoes.findUnique({ where: { token } });
  if (!link || !linkVigente(link) || link.certidaoIds.length === 0) return null;

  const certidoes = await prisma.certidao.findMany({
    where: { id: { in: link.certidaoIds } },
    orderBy: { validade: "asc" },
    include: { tipo: true },
  });

  return certidoes.map((c) => ({
    id: c.id,
    tipo: c.tipo.nome,
    descricao: c.descricao,
    validade: c.validade.toISOString().slice(0, 10),
    status: statusCertidao(c.validade.toISOString().slice(0, 10)),
    arquivoNome: c.arquivoNome,
  }));
}

/** Valida, para a rota de download, que `certidaoId` está liberada pelo `token`. */
export async function certidaoLiberadaNoLink(token: string, certidaoId: string) {
  const link = await prisma.linkPublicoCertidoes.findUnique({ where: { token } });
  if (!link || !linkVigente(link) || !link.certidaoIds.includes(certidaoId)) return null;

  const c = await prisma.certidao.findUnique({
    where: { id: certidaoId },
    select: { id: true, arquivoPath: true, arquivoNome: true },
  });
  if (!c?.arquivoPath) return null;
  return { caminho: c.arquivoPath, nome: c.arquivoNome ?? "certidao.pdf" };
}

/** Lista as certidões (com arquivo) servíveis do link, para o .zip. */
export async function certidoesDoLinkParaZip(token: string) {
  const link = await prisma.linkPublicoCertidoes.findUnique({ where: { token } });
  if (!link || !linkVigente(link) || link.certidaoIds.length === 0) return null;

  const certidoes = await prisma.certidao.findMany({
    where: { id: { in: link.certidaoIds }, arquivoPath: { not: null } },
    include: { tipo: true },
  });
  if (certidoes.length === 0) return null;

  return certidoes.map((c) => ({
    caminho: c.arquivoPath!,
    nome: `${c.tipo.nome}_${c.arquivoNome ?? c.id}`,
  }));
}
