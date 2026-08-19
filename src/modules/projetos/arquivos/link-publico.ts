import "server-only";
import { prisma } from "@/lib/prisma";
import { linkVigente } from "@/lib/link-publico";

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

/** Link vale agora? (ativo e não expirado) — regra em `lib/link-publico.ts`. */
export { linkVigente };

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
export type ArtPublica = {
  id: string;
  rotulo: string;
  disciplina: string | null;
  situacao: string;
  emitidaEm: string | null;
  /** Versões históricas COM arquivo — o cliente vê o histórico completo. */
  versoes: { id: string; numero: number; rotulo: string }[];
};
export type ConteudoPublico = {
  projeto: { codigo: string; nome: string };
  disciplinas: DisciplinaPublica[];
  arts: ArtPublica[];
};

/**
 * ARTs visíveis no link: as do projeto todo (sem disciplina) e as de disciplinas que
 * estão na whitelist do link — a mesma muralha dos arquivos. Só entram as que têm PDF:
 * sem arquivo não há o que baixar.
 */
async function artsPublicasDoLink(projetoId: string, disciplinaIds: string[]) {
  const arts = await prisma.art.findMany({
    where: {
      projetoId,
      arquivoPath: { not: null },
      OR: [{ disciplinaId: null }, { disciplinaId: { in: disciplinaIds } }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      tipo: true,
      numero: true,
      situacao: true,
      emitidaEm: true,
      disciplina: { select: { disciplinaTextoLegado: true } },
      versoes: {
        where: { arquivoPath: { not: null } },
        orderBy: { numero: "desc" },
        select: { id: true, numero: true, numeroArt: true },
      },
    },
  });

  return arts.map((a) => ({
    id: a.id,
    rotulo: `${a.tipo} ${a.numero}`,
    disciplina: a.disciplina?.disciplinaTextoLegado ?? null,
    situacao: a.situacao,
    emitidaEm: a.emitidaEm ? a.emitidaEm.toISOString().slice(0, 10) : null,
    versoes: a.versoes.map((v) => ({ id: v.id, numero: v.numero, rotulo: `${a.tipo} ${v.numeroArt}` })),
  }));
}

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
      disciplinaTextoLegado: true,
      uploads: {
        where: { validado: true, excluidoEm: null },
        orderBy: [{ nomeArquivo: "asc" }, { versao: "desc" }],
        select: { id: true, nomeArquivo: true, tamanho: true },
      },
    },
  });

  const arts = await artsPublicasDoLink(link.projetoId, link.disciplinaIds);

  return {
    projeto: { codigo: link.projeto.codigo, nome: link.projeto.nome },
    arts,
    disciplinas: disciplinas
      .map((d) => ({
        id: d.id,
        nome: d.disciplinaTextoLegado,
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
 * Valida, para a rota pública de download, que `id` (de uma ART **ou** de uma versão de ART)
 * está liberado pelo `token`: link vigente + ART do projeto do link + disciplina na whitelist
 * (ou ART sem disciplina). Retorna caminho/nome do PDF, ou `null`.
 */
export async function artLiberadaNoLink(token: string, id: string) {
  const link = await prisma.linkPublicoArquivos.findUnique({ where: { token } });
  if (!link || !linkVigente(link) || link.disciplinaIds.length === 0) return null;

  const escopo = {
    projetoId: link.projetoId,
    OR: [{ disciplinaId: null }, { disciplinaId: { in: link.disciplinaIds } }],
  };

  const art = await prisma.art.findFirst({
    where: { id, arquivoPath: { not: null }, ...escopo },
    select: { arquivoPath: true, arquivoNome: true, tipo: true, numero: true },
  });
  if (art?.arquivoPath) {
    return { caminho: art.arquivoPath, nome: art.arquivoNome ?? `${art.tipo}-${art.numero}.pdf` };
  }

  const versao = await prisma.artVersao.findFirst({
    where: { id, arquivoPath: { not: null }, art: escopo },
    select: { arquivoPath: true, arquivoNome: true, numeroArt: true, art: { select: { tipo: true } } },
  });
  if (versao?.arquivoPath) {
    return { caminho: versao.arquivoPath, nome: versao.arquivoNome ?? `${versao.art.tipo}-${versao.numeroArt}.pdf` };
  }
  return null;
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
      disciplinaTextoLegado: true,
      uploads: {
        where: { validado: true, excluidoEm: null },
        orderBy: [{ nomeArquivo: "asc" }, { versao: "desc" }],
        select: { caminho: true, nomeArquivo: true },
      },
    },
  });

  const entradas = disciplinas.flatMap((d) =>
    d.uploads.map((u) => ({ caminho: u.caminho, nome: `${d.disciplinaTextoLegado}/${u.nomeArquivo}` })),
  );
  if (entradas.length === 0) return null;
  return { codigo: link.projeto.codigo, entradas };
}
