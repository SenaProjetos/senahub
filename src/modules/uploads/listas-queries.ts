import "server-only";

import { can, type SubjectAutorizacao } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type ListaDocumentoResumo = {
  id: string;
  nome: string;
  totalDocumentosVisiveis: number;
  criadoPor: string;
};

/**
 * Listas são compartilhadas no projeto, mas a contagem nunca denuncia documentos de
 * outra disciplina para quem não tem a visão ampla. A tela pode exibir uma lista vazia
 * porque ela existe para o projeto, porém nenhum dos seus itens está no escopo do viewer.
 */
export async function listarListasDocumentos(opts: {
  projetoId: string;
  userId: string;
  veTodas: boolean;
}): Promise<ListaDocumentoResumo[]> {
  const listas = await prisma.listaDocumentos.findMany({
    where: { projetoId: opts.projetoId },
    orderBy: [{ nome: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      nome: true,
      criadoPor: { select: { name: true } },
      itens: {
        where: {
          documento: {
            substituidoPorId: null,
            ...(opts.veTodas
              ? {}
              : { disciplina: { responsaveis: { some: { userId: opts.userId } } } }),
          },
        },
        select: { id: true },
      },
    },
  });

  return listas.map((lista) => ({
    id: lista.id,
    nome: lista.nome,
    totalDocumentosVisiveis: lista.itens.length,
    criadoPor: lista.criadoPor.name,
  }));
}

/** Espelho de leitura do gate das Actions: não substitui a validação de escrita no servidor. */
export async function podeGerirListasDocumentos(user: SubjectAutorizacao, projetoId: string): Promise<boolean> {
  const [podeGerirProjeto, responsavel] = await Promise.all([
    can(user, "projetos", "gerir"),
    prisma.disciplinaResponsavel.findFirst({
      where: { userId: user.id, disciplina: { projetoId } },
      select: { id: true },
    }),
  ]);
  return podeGerirProjeto || responsavel != null;
}
