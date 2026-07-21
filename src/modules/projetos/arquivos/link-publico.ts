import "server-only";
import { prisma } from "@/lib/prisma";
import type { LinkPublicoArquivos } from "@/generated/prisma/client";

/**
 * Link público (sem login) de arquivos do projeto — somente ver + baixar.
 * Fonte única usada pela página pública (`/p/arquivos/[token]`), pelas rotas de
 * download (`/api/p/arquivos/[token]/...`) e pelo gerenciamento na aba Arquivos.
 *
 * Regras da muralha do link:
 *  - só uploads validados (`validado=true`), fora da lixeira (`excluidoEm=null`);
 *  - só disciplinas na whitelist `disciplinaIds` (editável — reflete no mesmo token);
 *  - `ativo=false` revoga na hora; `expiraEm` no passado desliga o link.
 */

/** Link vale agora? (ativo e não expirado). */
export function linkVigente(link: Pick<LinkPublicoArquivos, "ativo" | "expiraEm">): boolean {
  if (!link.ativo) return false;
  if (link.expiraEm && link.expiraEm.getTime() <= Date.now()) return false;
  return true;
}

/** Configuração do link para a tela de gerenciamento (aba Arquivos). */
export async function linkArquivosDoProjeto(projetoId: string) {
  return prisma.linkPublicoArquivos.findUnique({ where: { projetoId } });
}

export type ArquivoPublico = {
  id: string;
  nome: string;
  tamanho: number;
  ehPdf: boolean;
};
export type DisciplinaPublica = {
  id: string;
  nome: string;
  arquivos: ArquivoPublico[];
};
export type ConteudoPublico = {
  projeto: { codigo: string; nome: string };
  disciplinas: DisciplinaPublica[];
};

function ehPdf(nome: string): boolean {
  return nome.toLowerCase().endsWith(".pdf");
}

/**
 * Resolve o conteúdo visível de um link por token: só se o link estiver vigente.
 * Retorna `null` quando o token não existe ou o link está revogado/expirado
 * (a página pública trata como "link indisponível").
 */
export async function conteudoPublicoPorToken(token: string): Promise<ConteudoPublico | null> {
  const link = await prisma.linkPublicoArquivos.findUnique({
    where: { token },
    include: { projeto: { select: { codigo: true, nome: true } } },
  });
  if (!link || !linkVigente(link) || link.disciplinaIds.length === 0) return null;

  const disciplinas = await prisma.disciplina.findMany({
    where: { id: { in: link.disciplinaIds } },
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      nome: true,
      uploads: {
        where: { validado: true, excluidoEm: null },
        orderBy: [{ nomeArquivo: "asc" }, { versao: "desc" }],
        select: { id: true, nomeArquivo: true, tamanho: true },
      },
    },
  });

  return {
    projeto: { codigo: link.projeto.codigo, nome: link.projeto.nome },
    disciplinas: disciplinas
      .map((d) => ({
        id: d.id,
        nome: d.nome,
        arquivos: d.uploads.map((u) => ({
          id: u.id,
          nome: u.nomeArquivo,
          tamanho: u.tamanho,
          ehPdf: ehPdf(u.nomeArquivo),
        })),
      }))
      // Disciplina sem nenhum arquivo validado não aparece (nada a baixar).
      .filter((d) => d.arquivos.length > 0),
  };
}

/**
 * Valida, para as rotas de download, que o `uploadId` está de fato liberado pelo
 * `token`: link vigente + disciplina na whitelist + upload validado e fora da lixeira.
 * Retorna o upload servível (caminho/nome/mime) ou `null`.
 */
export async function uploadLiberadoNoLink(token: string, uploadId: string) {
  const link = await prisma.linkPublicoArquivos.findUnique({ where: { token } });
  if (!link || !linkVigente(link) || link.disciplinaIds.length === 0) return null;

  const upload = await prisma.upload.findFirst({
    where: {
      id: uploadId,
      validado: true,
      excluidoEm: null,
      disciplinaId: { in: link.disciplinaIds },
    },
    select: { id: true, nomeArquivo: true, caminho: true, mimeType: true },
  });
  return upload;
}

/**
 * Lista todos os uploads servíveis do link (para o .zip). `disciplinaId` opcional
 * restringe a uma disciplina (que ainda precisa estar na whitelist).
 */
export async function uploadsDoLinkParaZip(token: string, disciplinaId?: string) {
  const link = await prisma.linkPublicoArquivos.findUnique({
    where: { token },
    include: { projeto: { select: { codigo: true } } },
  });
  if (!link || !linkVigente(link) || link.disciplinaIds.length === 0) return null;

  const alvo = disciplinaId
    ? link.disciplinaIds.includes(disciplinaId)
      ? [disciplinaId]
      : []
    : link.disciplinaIds;
  if (alvo.length === 0) return null;

  const disciplinas = await prisma.disciplina.findMany({
    where: { id: { in: alvo } },
    orderBy: { ordem: "asc" },
    select: {
      nome: true,
      uploads: {
        where: { validado: true, excluidoEm: null },
        orderBy: [{ nomeArquivo: "asc" }, { versao: "desc" }],
        select: { caminho: true, nomeArquivo: true },
      },
    },
  });

  const entradas = disciplinas.flatMap((d) =>
    d.uploads.map((u) => ({ caminho: u.caminho, nome: `${d.nome}/${u.nomeArquivo}` })),
  );
  if (entradas.length === 0) return null;
  return { codigo: link.projeto.codigo, entradas };
}
