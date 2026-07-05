import "server-only";
import { prisma } from "@/lib/prisma";
import { statusValidacao } from "@/modules/uploads/validacao";

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

/**
 * Uploads por disciplina para o explorer (aba Arquivos), agrupados no client em
 * pacote (A/B/RECEBIDOS/OUTROS) → subpasta por extensão (derivada do nome, sem
 * coluna no banco). A pasta "Geral" (repositório ArquivoProjeto) é buscada à parte
 * via `arquivosDoProjeto`, pois é gated por permissão própria (`arquivos_gerais`).
 * `podeEnviar` por disciplina reflete a regra do /api/uploads (responsável ou global).
 */
export async function arvoreArquivosProjeto(
  projetoId: string,
  userId: string,
  ehGlobal: boolean,
) {
  const disciplinas = await prisma.disciplina.findMany({
    where: { projetoId },
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      nome: true,
      status: true,
      responsaveis: { select: { userId: true } },
      uploads: {
        orderBy: [{ pacote: "asc" }, { nomeArquivo: "asc" }, { versao: "desc" }],
        select: {
          id: true,
          pacote: true,
          nomeArquivo: true,
          versao: true,
          tamanho: true,
          validado: true,
          validadoEm: true,
          origem: true,
          revisaoObs: true,
          revisaoEm: true,
          autorId: true,
          createdAt: true,
        },
      },
      exigePacoteA: true,
      exigePacoteB: true,
    },
  });

  const autorIds = [...new Set(disciplinas.flatMap((d) => d.uploads.map((u) => u.autorId)))];
  const autores = autorIds.length
    ? await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } })
    : [];
  const nomeAutor = new Map(autores.map((u) => [u.id, u.name]));

  return {
    disciplinas: disciplinas.map((d) => ({
      id: d.id,
      nome: d.nome,
      finalizado: d.status === "aprovado",
      podeEnviar: ehGlobal || d.responsaveis.some((r) => r.userId === userId),
      // Progresso da validação parcial (só entregáveis: pacote A/B, versão atual).
      resumo: statusValidacao(
        d.uploads.map((u) => ({
          pacote: u.pacote as "A" | "B" | "OUTROS" | "RECEBIDOS",
          nomeArquivo: u.nomeArquivo,
          versao: u.versao,
          validado: u.validado,
          origem: u.origem as "manual" | "ferramenta",
        })),
        { exigePacoteA: d.exigePacoteA, exigePacoteB: d.exigePacoteB },
      ),
      arquivos: d.uploads.map((u) => ({
        id: u.id,
        nome: u.nomeArquivo,
        pacote: u.pacote as "A" | "B" | "OUTROS" | "RECEBIDOS",
        versao: u.versao,
        tamanho: u.tamanho,
        aprovado: u.validado,
        origem: u.origem as "manual" | "ferramenta",
        ajusteObs: u.revisaoObs,
        ajusteEm: u.revisaoEm ? u.revisaoEm.toISOString() : null,
        autor: nomeAutor.get(u.autorId) ?? "—",
        data: (u.validadoEm ?? u.createdAt).toISOString(),
        downloadUrl: `/api/uploads/${u.id}/download`,
      })),
    })),
  };
}

export type ArvoreArquivos = Awaited<ReturnType<typeof arvoreArquivosProjeto>>;
export type ArvoreDisciplina = ArvoreArquivos["disciplinas"][number];
export type ArvoreArquivoItem = ArvoreDisciplina["arquivos"][number];
