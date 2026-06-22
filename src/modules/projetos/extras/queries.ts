import "server-only";
import { prisma } from "@/lib/prisma";

/** Dados das funções extras do projeto: revisões, composição de preço, LM, linhas de base, checklist e riscos. */
export async function extrasDoProjeto(projetoId: string) {
  const [solic, composicao, lm, linhas, disciplinas, checklist, riscos] = await Promise.all([
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
    prisma.checklistItemProjeto.findMany({ where: { projetoId }, orderBy: { ordem: "asc" } }),
    prisma.riscoProjeto.findMany({ where: { projetoId }, orderBy: { createdAt: "asc" } }),
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
    checklist: checklist.map((c) => ({
      id: c.id,
      descricao: c.descricao,
      concluido: c.concluido,
      concluidoEm: c.concluidoEm?.toISOString() ?? null,
      ordem: c.ordem,
    })),
    riscos: riscos.map((r) => ({
      id: r.id,
      descricao: r.descricao,
      probabilidade: r.probabilidade,
      impacto: r.impacto,
      mitigacao: r.mitigacao,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
