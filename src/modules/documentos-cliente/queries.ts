import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const incluir = {
  versoes: {
    orderBy: { numero: "desc" },
    select: { id: true, numero: true, nomeArquivo: true, mime: true, tamanho: true, createdAt: true, autorId: true },
  },
  autor: { select: { name: true } },
} satisfies Prisma.DocumentoInclude;

type DocumentoComVersoes = Prisma.DocumentoGetPayload<{ include: typeof incluir }>;

function mapear(d: DocumentoComVersoes) {
  const atual = d.versoes[0] ?? null;
  return {
    id: d.id,
    nome: d.nome,
    origem: d.origem,
    canal: d.canal,
    enviadoPor: d.enviadoPor,
    categoria: d.categoria,
    autor: d.autor?.name ?? d.enviadoPor ?? "—",
    criadoEm: d.createdAt.toISOString(),
    totalVersoes: d.versoes.length,
    atual: atual
      ? {
          id: atual.id,
          numero: atual.numero,
          nomeArquivo: atual.nomeArquivo,
          tamanho: atual.tamanho,
          criadoEm: atual.createdAt.toISOString(),
          downloadUrl: `/api/documentos/${atual.id}/download`,
        }
      : null,
  };
}

export type DocumentoItem = ReturnType<typeof mapear>;

/** Documentos anexados a uma proposta (âncora comercial). */
export async function documentosDaProposta(propostaId: string): Promise<DocumentoItem[]> {
  const docs = await prisma.documento.findMany({
    where: { propostaId },
    orderBy: { createdAt: "desc" },
    include: incluir,
  });
  return docs.map(mapear);
}

/**
 * "Recebidos do cliente" de um projeto = documentos do próprio projeto **+** os
 * herdados da proposta que gerou este projeto (join `Proposta.projetoId`). Sem
 * mistura: cada projeto herda só da sua proposta de origem. (Usado na Fase 2.)
 */
export async function recebidosDoProjeto(projetoId: string): Promise<DocumentoItem[]> {
  const proposta = await prisma.proposta.findUnique({
    where: { projetoId },
    select: { id: true },
  });
  const docs = await prisma.documento.findMany({
    where: {
      OR: [{ projetoId }, ...(proposta ? [{ propostaId: proposta.id }] : [])],
    },
    orderBy: { createdAt: "desc" },
    include: incluir,
  });
  return docs.map(mapear);
}
