import "server-only";
import { prisma } from "@/lib/prisma";
import { versaoDoProjeto } from "./versao";

/** Toda versão (rascunho e publicada), para a tela de administração. */
export async function listarVersoesAdmin() {
  const [versoes, projetos] = await Promise.all([
    prisma.nomenclaturaVersao.findMany({
      orderBy: { numero: "asc" },
      select: {
        id: true,
        numero: true,
        nome: true,
        modelo: true,
        larguraNumero: true,
        sequenciaPor: true,
        vigenteDesde: true,
        publicadaEm: true,
        descricao: true,
        publicadaPor: { select: { name: true } },
      },
    }),
    prisma.projeto.groupBy({ by: ["nomenclaturaVersaoId"], _count: true }),
  ]);
  const usoPorVersao = new Map(projetos.map((p) => [p.nomenclaturaVersaoId, p._count]));
  return versoes.map((v) => ({ ...v, projetosFixados: usoPorVersao.get(v.id) ?? 0 }));
}

export type VersaoAdmin = Awaited<ReturnType<typeof listarVersoesAdmin>>[number];

/** Só as publicadas — para o seletor de versão de um projeto (D3): rascunho não é escolhível. */
export async function listarVersoesPublicadas() {
  return prisma.nomenclaturaVersao.findMany({
    where: { publicadaEm: { not: null } },
    orderBy: { numero: "asc" },
    select: { id: true, numero: true, nome: true, publicadaEm: true },
  });
}

/**
 * A versão vigente hoje (a que um projeto criado agora receberia) — usada como referência para
 * D11 (filtrar catálogo pela validade) fora do contexto de um projeto já existente.
 */
export async function versaoVigenteHoje() {
  const versoes = await prisma.nomenclaturaVersao.findMany({
    where: { publicadaEm: { not: null } },
    select: { id: true, numero: true, nome: true, modelo: true, larguraNumero: true, sequenciaPor: true, vigenteDesde: true, publicadaEm: true },
  });
  return versaoDoProjeto({ nomenclaturaVersaoId: null, createdAt: new Date() }, versoes);
}

/**
 * Quantos documentos ativos (pacote A) da disciplina ficariam "fora do padrão" se o projeto
 * passasse a usar `modelo` — a contagem do D3, mostrada ANTES de confirmar a troca de versão.
 * Só olha documentos com nome de arquivo (o próprio `DocumentoDisciplina.nomeArquivo`), pura
 * leitura, não altera nada.
 */
export async function contarForaDoPadraoComModelo(projetoId: string, modelo: string | null): Promise<number> {
  const { foraDoPadrao } = await import("@/modules/projetos/pranchas/codigo");
  const docs = await prisma.documentoDisciplina.findMany({
    where: { disciplina: { projetoId }, chave: { startsWith: "A/" }, substituidoPorId: null },
    select: { nomeArquivo: true },
  });
  return docs.filter((d) => foraDoPadrao(d.nomeArquivo, modelo)).length;
}
