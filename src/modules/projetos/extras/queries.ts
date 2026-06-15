import "server-only";
import { prisma } from "@/lib/prisma";

/** Dados das funções extras do projeto: revisões, composição de preço, LM e linhas de base. */
export async function extrasDoProjeto(projetoId: string) {
  const [solic, composicao, lm, linhas, disciplinas] = await Promise.all([
    prisma.solicitacaoRevisao.findMany({
      where: { disciplina: { projetoId } },
      orderBy: { createdAt: "desc" },
      include: { disciplina: { select: { nome: true } } },
    }),
    prisma.projetoComposicaoPreco.findUnique({
      where: { projetoId },
      include: { itens: { orderBy: { ordem: "asc" } } },
    }),
    prisma.lmConfig.findUnique({ where: { projetoId } }),
    prisma.linhaBase.findMany({ where: { projetoId }, orderBy: { createdAt: "desc" } }),
    prisma.disciplina.findMany({ where: { projetoId }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
  ]);

  const autorIds = [...new Set(solic.map((s) => s.solicitanteId))];
  const autores = await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } });
  const nome = new Map(autores.map((u) => [u.id, u.name]));

  return {
    disciplinas,
    solicitacoes: solic.map((s) => ({
      id: s.id,
      disciplina: s.disciplina.nome,
      solicitante: nome.get(s.solicitanteId) ?? "—",
      motivo: s.motivo,
      status: s.status,
      respostaMotivo: s.respostaMotivo,
      createdAt: s.createdAt.toISOString(),
    })),
    composicao: composicao
      ? {
          observacao: composicao.observacao,
          itens: composicao.itens.map((i) => ({
            id: i.id,
            descricao: i.descricao,
            quantidade: Number(i.quantidade),
            valorUnitario: Number(i.valorUnitario),
          })),
        }
      : { observacao: null, itens: [] as { id: string; descricao: string; quantidade: number; valorUnitario: number }[] },
    lmConteudo: lm?.conteudo ?? "",
    linhasBase: linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      tarefas: Array.isArray(l.snapshot) ? (l.snapshot as unknown[]).length : 0,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}
