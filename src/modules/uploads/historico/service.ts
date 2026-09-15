import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  categoriaDoTipo,
  chaveAgrupamentoAcesso,
  type OrigemEvento,
  type TipoAcesso,
  type TipoEvento,
} from "@/modules/uploads/historico/eventos";

/**
 * Gravação do histórico por documento. Chamado DEPOIS da mutação ou do envio do arquivo, e
 * nunca propaga erro: a ação de negócio já aconteceu e está no AuditLog — falhar aqui não pode
 * devolver erro ao usuário nem abortar um download. Por isso toda função engole e loga.
 */

type Detalhe = Prisma.InputJsonValue;

const LOTE_UPSERT = 20;

/** Evento ligado diretamente a um documento (metadados, status, listas). */
export async function registrarEventoDocumento(e: {
  documentoId: string;
  tipo: TipoEvento;
  userId: string | null;
  uploadId?: string | null;
  detalhe?: Detalhe;
}): Promise<void> {
  try {
    await prisma.documentoEvento.create({
      data: {
        documentoId: e.documentoId,
        uploadId: e.uploadId ?? null,
        tipo: e.tipo,
        categoria: categoriaDoTipo(e.tipo),
        userId: e.userId,
        detalhe: e.detalhe,
      },
    });
  } catch (err) {
    console.error(`[historico-documento] falha ao registrar ${e.tipo}:`, err);
  }
}

/**
 * Evento de alteração a partir de arquivos (validar, lixeira, renomear...). Resolve o documento
 * de cada Upload e grava nome e revisão no `detalhe` — a linha precisa continuar legível mesmo
 * depois que o arquivo for excluído em definitivo. Upload legado sem documento é ignorado.
 */
export async function registrarEventoUploads(e: {
  uploadIds: string[];
  tipo: TipoEvento;
  userId: string | null;
  detalhe?: Record<string, Prisma.InputJsonValue | null>;
}): Promise<void> {
  if (e.uploadIds.length === 0) return;
  try {
    const uploads = await prisma.upload.findMany({
      // Só `id: { in }` de propósito: lookup por id é isento do filtro de lixeira (lib/prisma.ts),
      // e restaurar/excluir em definitivo agem justamente sobre arquivo que está nela.
      where: { id: { in: e.uploadIds } },
      select: { id: true, documentoId: true, nomeArquivo: true, versao: true },
    });
    const dados = uploads
      .filter((u): u is typeof u & { documentoId: string } => u.documentoId !== null)
      .map((u) => ({
        documentoId: u.documentoId,
        uploadId: u.id,
        tipo: e.tipo,
        categoria: categoriaDoTipo(e.tipo),
        userId: e.userId,
        detalhe: { arquivo: u.nomeArquivo, versao: u.versao, ...e.detalhe },
      }));
    if (dados.length > 0) await prisma.documentoEvento.createMany({ data: dados });
  } catch (err) {
    console.error(`[historico-documento] falha ao registrar ${e.tipo}:`, err);
  }
}

/**
 * Download/visualização. Repetições da mesma pessoa (ou do mesmo link público), no mesmo
 * arquivo e na mesma ação dentro da janela de 10 min somam `quantidade` na MESMA linha — o
 * upsert na chave única é atômico, então duas requisições simultâneas não duplicam.
 */
export async function registrarAcessoUploads(a: {
  uploadIds: string[];
  tipo: TipoAcesso;
  origem: OrigemEvento;
  userId: string | null;
  linkId?: string | null;
  /** Como o arquivo saiu: `zip`, `dwg`, `ifc`... Ausente = arquivo avulso. */
  via?: string;
}): Promise<void> {
  if (a.uploadIds.length === 0) return;
  try {
    const uploads = await prisma.upload.findMany({
      where: { id: { in: a.uploadIds } },
      select: { id: true, documentoId: true, nomeArquivo: true, versao: true },
    });
    const agora = new Date();
    const comDocumento = uploads.filter((u): u is typeof u & { documentoId: string } => u.documentoId !== null);
    // Lotes em paralelo: um zip de 500 arquivos em fila atrasaria o início do download.
    for (let i = 0; i < comDocumento.length; i += LOTE_UPSERT) {
      await Promise.all(
        comDocumento.slice(i, i + LOTE_UPSERT).map((u) => {
          const chave = chaveAgrupamentoAcesso({
            tipo: a.tipo,
            uploadId: u.id,
            origem: a.origem,
            userId: a.userId,
            linkId: a.linkId,
            em: agora,
          });
          return prisma.documentoEvento.upsert({
            where: { chaveAgrupamento: chave },
            create: {
              documentoId: u.documentoId,
              uploadId: u.id,
              tipo: a.tipo,
              categoria: categoriaDoTipo(a.tipo),
              origem: a.origem,
              userId: a.userId,
              linkId: a.linkId ?? null,
              chaveAgrupamento: chave,
              detalhe: { arquivo: u.nomeArquivo, versao: u.versao, ...(a.via ? { via: a.via } : {}) },
              createdAt: agora,
              ultimoEm: agora,
            },
            update: { quantidade: { increment: 1 }, ultimoEm: agora },
          });
        }),
      );
    }
  } catch (err) {
    console.error(`[historico-documento] falha ao registrar ${a.tipo}:`, err);
  }
}
