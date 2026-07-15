import "server-only";
import { prisma } from "@/lib/prisma";
import { statusValidacao } from "@/modules/uploads/validacao";

/**
 * Uploads por disciplina para o explorer (aba Arquivos), agrupados no client em
 * pacote (A/B/RECEBIDOS/OUTROS) → subpasta por extensão (derivada do nome, sem
 * coluna no banco). A pasta "Geral" foi absorvida pelo repositório unificado
 * `Documento` (origem=interno) na Fase 5a — ver `geralDoProjeto` em
 * `modules/documentos-cliente/queries.ts`.
 * `podeEnviar` por disciplina reflete a regra do /api/uploads (responsável ou global,
 * E capability `arquivos:enviar`).
 *
 * Muralha por disciplina (recurso `arquivos`): quando `veTodas` é false, o usuário só
 * enxerga as disciplinas onde é responsável — mesma regra da rota de download. Global
 * e quem tem `arquivos:ver_todas_disciplinas` recebem `veTodas=true`.
 */
export async function arvoreArquivosProjeto(
  projetoId: string,
  userId: string,
  ehGlobal: boolean,
  opts: { veTodas?: boolean; podeEnviarCap?: boolean } = {},
) {
  const veTodas = opts.veTodas ?? ehGlobal;
  const podeEnviarCap = opts.podeEnviarCap ?? ehGlobal;
  const disciplinas = await prisma.disciplina.findMany({
    where: veTodas ? { projetoId } : { projetoId, responsaveis: { some: { userId } } },
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      nome: true,
      status: true,
      responsaveis: { select: { userId: true } },
      uploads: {
        // Lixeira: leitura aninhada NÃO passa pelo filtro global (lib/prisma.ts) → explícito.
        where: { excluidoEm: null },
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
      podeEnviar: podeEnviarCap && (ehGlobal || d.responsaveis.some((r) => r.userId === userId)),
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
