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

/** Cliente-dono de um projeto (p/ ancorar uploads de documentos no projeto). */
export async function clienteDoProjeto(projetoId: string): Promise<string | null> {
  const p = await prisma.projeto.findUnique({ where: { id: projetoId }, select: { clienteId: true } });
  return p?.clienteId ?? null;
}

export type GrupoDocumentos = {
  chave: string;
  tipo: "proposta" | "projeto" | "geral";
  titulo: string;
  subtitulo: string | null;
  documentos: DocumentoItem[];
};

/**
 * Todos os documentos de um cliente, **agrupados por proposta → projeto** (+ grupo
 * "gerais" p/ os sem vínculo). É a visão "segue o cliente" da ficha do cliente.
 */
export async function documentosDoCliente(clienteId: string): Promise<GrupoDocumentos[]> {
  const docs = await prisma.documento.findMany({
    where: { clienteId },
    orderBy: { createdAt: "desc" },
    include: {
      ...incluir,
      proposta: { select: { numero: true, titulo: true, projeto: { select: { codigo: true, nome: true } } } },
      projeto: { select: { codigo: true, nome: true } },
    },
  });

  const grupos = new Map<string, GrupoDocumentos>();
  for (const d of docs) {
    let chave: string, tipo: GrupoDocumentos["tipo"], titulo: string, subtitulo: string | null;
    if (d.propostaId && d.proposta) {
      chave = `prop:${d.propostaId}`;
      tipo = "proposta";
      titulo = `${d.proposta.numero} · ${d.proposta.titulo}`;
      subtitulo = d.proposta.projeto ? `Projeto ${d.proposta.projeto.codigo} · ${d.proposta.projeto.nome}` : "Sem projeto ainda";
    } else if (d.projetoId && d.projeto) {
      chave = `proj:${d.projetoId}`;
      tipo = "projeto";
      titulo = `Projeto ${d.projeto.codigo} · ${d.projeto.nome}`;
      subtitulo = null;
    } else {
      chave = "geral";
      tipo = "geral";
      titulo = "Gerais do cliente";
      subtitulo = null;
    }
    const g = grupos.get(chave) ?? { chave, tipo, titulo, subtitulo, documentos: [] };
    g.documentos.push(mapear(d));
    grupos.set(chave, g);
  }
  // Ordem: propostas, depois projetos, depois gerais.
  const ordem = { proposta: 0, projeto: 1, geral: 2 } as const;
  return [...grupos.values()].sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
}

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
