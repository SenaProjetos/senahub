import "server-only";
import { prisma } from "@/lib/prisma";
import { perguntasDoPadraoParaCriar } from "@/modules/inputs/perguntas";

/**
 * Cria, no projeto, os inputs padrão (InputTemplate) das disciplinas dele — sem duplicar e sem
 * ressuscitar: pergunta que veio do padrão e foi editada ou removida não volta.
 */
export async function aplicarInputsPadraoCore(projetoId: string): Promise<number> {
  const [proj, existentes, templates] = await Promise.all([
    prisma.projeto.findUnique({ where: { id: projetoId }, select: { disciplinas: { select: { disciplinaTextoLegado: true } } } }),
    // Ativas E removidas: as duas impedem o padrão de recriar a pergunta.
    prisma.inputProjeto.findMany({ where: { projetoId }, select: { templateId: true, disciplina: true, pergunta: true } }),
    prisma.inputTemplate.findMany({ where: { ativo: true }, orderBy: [{ disciplina: "asc" }, { ordem: "asc" }] }),
  ]);
  if (!proj) return 0;
  const novos = perguntasDoPadraoParaCriar(
    templates,
    existentes,
    proj.disciplinas.map((d) => d.disciplinaTextoLegado),
  );
  if (novos.length === 0) return 0;
  // Único (projetoId, templateId): dois "Aplicar padrão" simultâneos não duplicam.
  const { count } = await prisma.inputProjeto.createMany({
    data: novos.map((t) => ({ projetoId, disciplina: t.disciplina, pergunta: t.pergunta, ordem: t.ordem, templateId: t.id })),
    skipDuplicates: true,
  });
  return count;
}
