import "server-only";
import { prisma } from "@/lib/prisma";
import { contarApontamentos, situacaoSolicitacao, type ApontamentosDaRodada, type SituacaoSolicitacao } from "./situacao";

export type SolicitacaoRevisaoView = {
  id: string;
  disciplinaId: string;
  motivo: string;
  solicitante: string;
  data: string;
  situacao: SituacaoSolicitacao | null;
  apontamentos: ApontamentosDaRodada;
};

/**
 * Solicitações de revisão do projeto, da mais nova para a mais antiga, com a situação tirada
 * dos apontamentos de cada rodada (ligados pela tarefa que o envio criou). O chamador já
 * confirmou que o usuário enxerga o projeto.
 */
export async function solicitacoesRevisaoDoProjeto(projetoId: string): Promise<SolicitacaoRevisaoView[]> {
  const solicitacoes = await prisma.solicitacaoRevisao.findMany({
    where: { disciplina: { projetoId } },
    orderBy: { createdAt: "desc" },
    select: { id: true, disciplinaId: true, motivo: true, solicitanteId: true, tarefaId: true, createdAt: true },
  });
  if (solicitacoes.length === 0) return [];

  const tarefaIds = [...new Set(solicitacoes.map((s) => s.tarefaId).filter((id): id is string => id != null))];
  const [autores, apontamentos] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...new Set(solicitacoes.map((s) => s.solicitanteId))] } },
      select: { id: true, name: true },
    }),
    tarefaIds.length > 0
      ? prisma.pendencia.findMany({
          // Soft delete é explícito em `Pendencia` (fora da extension de lib/prisma.ts).
          where: { tarefaId: { in: tarefaIds }, excluidoEm: null },
          select: { tarefaId: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  const nome = new Map(autores.map((u) => [u.id, u.name]));
  const statusPorTarefa = new Map<string, string[]>();
  for (const p of apontamentos) {
    if (!p.tarefaId) continue;
    const lista = statusPorTarefa.get(p.tarefaId);
    if (lista) lista.push(p.status);
    else statusPorTarefa.set(p.tarefaId, [p.status]);
  }

  return solicitacoes.map((s) => {
    const contagem = contarApontamentos(s.tarefaId ? (statusPorTarefa.get(s.tarefaId) ?? []) : []);
    return {
      id: s.id,
      disciplinaId: s.disciplinaId,
      motivo: s.motivo,
      solicitante: nome.get(s.solicitanteId) ?? "—",
      data: s.createdAt.toISOString(),
      situacao: situacaoSolicitacao(contagem),
      apontamentos: contagem,
    };
  });
}
