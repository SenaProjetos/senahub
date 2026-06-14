import "server-only";
import { prisma } from "@/lib/prisma";

/** Arquivos do projeto (repositório geral) com versões e autores resolvidos. */
export async function arquivosDoProjeto(projetoId: string) {
  const arquivos = await prisma.arquivoProjeto.findMany({
    where: { projetoId },
    orderBy: { createdAt: "desc" },
    include: {
      versoes: {
        orderBy: { numero: "desc" },
        select: { id: true, numero: true, nomeArquivo: true, mime: true, tamanho: true, createdAt: true, autorId: true },
      },
    },
  });

  const autorIds = [
    ...new Set(arquivos.flatMap((a) => [a.autorId, ...a.versoes.map((v) => v.autorId)])),
  ];
  const autores = await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } });
  const nome = new Map(autores.map((u) => [u.id, u.name]));

  return arquivos.map((a) => {
    const atual = a.versoes[0] ?? null;
    return {
      id: a.id,
      nome: a.nome,
      categoria: a.categoria,
      descricao: a.descricao,
      autor: nome.get(a.autorId) ?? "—",
      criadoEm: a.createdAt.toISOString(),
      totalVersoes: a.versoes.length,
      atual: atual
        ? {
            id: atual.id,
            numero: atual.numero,
            nomeArquivo: atual.nomeArquivo,
            tamanho: atual.tamanho,
            criadoEm: atual.createdAt.toISOString(),
          }
        : null,
      versoes: a.versoes.map((v) => ({
        id: v.id,
        numero: v.numero,
        nomeArquivo: v.nomeArquivo,
        tamanho: v.tamanho,
        criadoEm: v.createdAt.toISOString(),
        autor: nome.get(v.autorId) ?? "—",
      })),
    };
  });
}

export type ArquivoProjetoItem = Awaited<ReturnType<typeof arquivosDoProjeto>>[number];
