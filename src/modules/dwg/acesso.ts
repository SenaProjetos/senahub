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
  const ehGlobal = acessoGlobal(user);

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
    const autorizado =
      ehGlobal ||
      (await podeLerDocumento(
        user,
        { propostaId: doc.propostaId, projetoId: doc.projetoId },
        doc.origem,
        doc.exibirEmRecebidos,
      ));
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
  const podeBaixar = ehGlobal || (await podeBaixarArquivo(user.role));

  return {
    status: conversao.status,
    progresso: conversao.progresso,
    caminhoDxf: conversao.caminhoDxf,
    erro: conversao.erro,
    concluidoEm: conversao.concluidoEm,
    autorizado: podeVerEstaDisc && podeBaixar,
  };
}
