import "server-only";

import { prisma } from "@/lib/prisma";
import { acessoGlobal } from "@/lib/roles";
import { podeVerTodasDisciplinas, podeBaixarArquivo } from "@/modules/arquivos/acesso";
import { podeLerDocumento } from "@/modules/documentos-cliente/acesso";
import { parseDesenhoId } from "@/modules/dwg/desenho-ref";
import type { SessionUser } from "@/lib/session";

export type AcessoDesenho = {
  status: string;
  progresso: number | null;
  caminhoDxf: string | null;
  erro: string | null;
  concluidoEm: Date | null;
  autorizado: boolean;
} | null;

type DisciplinaComAcesso = {
  projetoId: string;
  responsaveis: readonly { userId: string }[];
  projeto: { membros: readonly { userId: string }[] };
};

type DocumentoComAcesso = {
  propostaId: string | null;
  projetoId: string | null;
  origem: string;
  exibirEmRecebidos: boolean;
};

async function podeAcessarDocumentoDwg(user: SessionUser, documento: DocumentoComAcesso): Promise<boolean> {
  return acessoGlobal(user) ||
    (await podeLerDocumento(
      user,
      { propostaId: documento.propostaId, projetoId: documento.projetoId },
      documento.origem,
      documento.exibirEmRecebidos,
    ));
}

async function podeAcessarUploadDwg(user: SessionUser, disciplina: DisciplinaComAcesso): Promise<boolean> {
  const ehGlobal = acessoGlobal(user);
  const ehRespDesta = disciplina.responsaveis.some((r) => r.userId === user.id);
  const ehMembro = disciplina.projeto.membros.some((m) => m.userId === user.id);
  let ehRespProjeto = false;
  if (!ehGlobal && !ehMembro) {
    ehRespProjeto =
      (await prisma.disciplina.count({
        where: { projetoId: disciplina.projetoId, responsaveis: { some: { userId: user.id } } },
      })) > 0;
  }
  const participaProjeto = ehMembro || ehRespProjeto;
  const veTodas = await podeVerTodasDisciplinas(user);
  const podeVerEstaDisc = ehGlobal || ehRespDesta || (veTodas && participaProjeto);
  const podeBaixar = ehGlobal || (await podeBaixarArquivo(user));
  return podeVerEstaDisc && podeBaixar;
}

/** Autoriza um desenho mesmo antes de existir uma linha de conversão. */
export async function podeAcessarDesenho(user: SessionUser, desenhoId: string): Promise<boolean> {
  const ref = parseDesenhoId(desenhoId);
  if (ref.tipo === "documento") {
    const versao = await prisma.documentoVersao.findUnique({
      where: { id: ref.id },
      select: {
        documento: { select: { propostaId: true, projetoId: true, origem: true, exibirEmRecebidos: true } },
      },
    });
    return !!versao?.documento && podeAcessarDocumentoDwg(user, versao.documento);
  }

  const upload = await prisma.upload.findUnique({
    where: { id: ref.id },
    select: {
      disciplina: {
        select: {
          projetoId: true,
          responsaveis: { select: { userId: true } },
          projeto: { select: { membros: { select: { userId: true } } } },
        },
      },
    },
  });
  return !!upload && podeAcessarUploadDwg(user, upload.disciplina);
}

/**
 * Resolve o estado da conversão + autorização de leitura de um desenho (Upload de
 * disciplina ou DocumentoVersao recebida do cliente), pela chave unificada
 * `desenhoId`. Fonte única pra rota de streaming (F3.1) e pro probe de status
 * client-side (`buscarStatusConversaoDwg`) — a mesma regra de autorização nos dois
 * lugares, sem duplicar a ramificação por origem.
 *
 * Upload: mesma muralha por disciplina da rota de download (`arquivos:baixar` +
 * `ver_todas_disciplinas`). DocumentoVersao: `podeLerDocumento`. `null` se a
 * conversão/origem não existe.
 */
export async function resolverAcessoDesenho(user: SessionUser, desenhoId: string): Promise<AcessoDesenho> {
  const ref = parseDesenhoId(desenhoId);

  if (ref.tipo === "documento") {
    const conversao = await prisma.conversaoDesenho.findUnique({
      where: { documentoVersaoId: ref.id },
      select: {
        status: true,
        progresso: true,
        caminhoDxf: true,
        erro: true,
        concluidoEm: true,
        documentoVersao: {
          select: {
            documento: {
              select: { propostaId: true, projetoId: true, origem: true, exibirEmRecebidos: true },
            },
          },
        },
      },
    });
    if (!conversao || !conversao.documentoVersao) return null;
    const doc = conversao.documentoVersao.documento;
    const autorizado = await podeAcessarDocumentoDwg(user, doc);
    return {
      status: conversao.status,
      progresso: conversao.progresso,
      caminhoDxf: conversao.caminhoDxf,
      erro: conversao.erro,
      concluidoEm: conversao.concluidoEm,
      autorizado,
    };
  }

  const conversao = await prisma.conversaoDesenho.findUnique({
    where: { uploadId: ref.id },
    select: {
      status: true,
      progresso: true,
      caminhoDxf: true,
      erro: true,
      concluidoEm: true,
      upload: {
        select: {
          disciplina: {
            select: {
              projetoId: true,
              responsaveis: { select: { userId: true } },
              projeto: { select: { membros: { select: { userId: true } } } },
            },
          },
        },
      },
    },
  });
  if (!conversao || !conversao.upload) return null;

  const { disciplina } = conversao.upload;
  const autorizado = await podeAcessarUploadDwg(user, disciplina);

  return {
    status: conversao.status,
    progresso: conversao.progresso,
    caminhoDxf: conversao.caminhoDxf,
    erro: conversao.erro,
    concluidoEm: conversao.concluidoEm,
    autorizado,
  };
}
