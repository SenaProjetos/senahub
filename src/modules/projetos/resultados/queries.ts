import "server-only";

import { prisma } from "@/lib/prisma";
import { minutosSessao } from "@/modules/ponto/format";
import type { DadosResultados, MinutosApontados } from "./resultados";

/**
 * Os dados crus da aba Resultados (a conta é de `resultados.ts`, que a tela refaz a cada filtro). As sessões do
 * ponto chegam JÁ SOMADAS por (linha, disciplina, pessoa): o projeto pode ter milhares delas, e a tela só precisa
 * dos totais. Sessão ainda aberta conta até agora, como no editor da EAP.
 *
 * `verCusto`: só quem vê o financeiro recebe o custo/hora das pessoas (é a remuneração delas).
 */
export async function resultadosDoProjeto(projetoId: string, opcoes: { verCusto: boolean }): Promise<DadosResultados> {
  const [linhas, disciplinas] = await Promise.all([
    prisma.eapTarefa.findMany({
      where: { projetoId },
      select: {
        id: true,
        codigoEap: true,
        nome: true,
        disciplinaId: true,
        ordem: true,
        _count: { select: { filhas: true } },
        atribuicoes: { select: { userId: true, horasPrevistas: true } },
      },
    }),
    prisma.disciplina.findMany({
      where: { projetoId },
      select: { id: true, disciplinaTextoLegado: true, catalogo: { select: { nome: true } } },
      orderBy: { ordem: "asc" },
    }),
  ]);
  const linhaIds = linhas.map((l) => l.id);
  // A sessão diz o projeto; a com tarefa do cronograma também chega pelo card (mesma leitura do editor da EAP).
  const sessoes = await prisma.sessaoTrabalho.findMany({
    where: { OR: [{ projetoId }, ...(linhaIds.length ? [{ tarefa: { eapTarefaId: { in: linhaIds } } }] : [])] },
    select: { userId: true, inicio: true, fim: true, tarefa: { select: { eapTarefaId: true, disciplinaId: true } } },
  });

  const disciplinaDaLinha = new Map(linhas.map((l) => [l.id, l.disciplinaId]));
  const agora = new Date();
  const somados = new Map<string, MinutosApontados>();
  for (const s of sessoes) {
    // Card de linha de OUTRO projeto não soma aqui (a sessão foi posta no projeto errado): conta como sem tarefa.
    const linhaId = s.tarefa?.eapTarefaId && disciplinaDaLinha.has(s.tarefa.eapTarefaId) ? s.tarefa.eapTarefaId : null;
    const disciplinaId = linhaId ? (disciplinaDaLinha.get(linhaId) ?? null) : (s.tarefa?.disciplinaId ?? null);
    const chave = `${linhaId ?? ""}|${disciplinaId ?? ""}|${s.userId}`;
    const atual = somados.get(chave) ?? { linhaId, disciplinaId, userId: s.userId, minutos: 0 };
    atual.minutos += minutosSessao(s.inicio, s.fim ?? agora);
    somados.set(chave, atual);
  }

  const previstas = linhas.flatMap((l) =>
    l.atribuicoes.map((a) => ({ linhaId: l.id, userId: a.userId, horas: Number(a.horasPrevistas ?? 0) })),
  );
  const userIds = new Set<string>();
  for (const p of previstas) if (p.userId) userIds.add(p.userId);
  for (const s of somados.values()) userIds.add(s.userId);

  const [pessoas, recursos] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } }),
    opcoes.verCusto
      ? prisma.recurso.findMany({ where: { userId: { in: [...userIds] }, custoHora: { not: null } }, select: { userId: true, custoHora: true } })
      : Promise.resolve([]),
  ]);

  return {
    linhas: linhas.map((l) => ({
      id: l.id,
      codigo: l.codigoEap,
      nome: l.nome,
      disciplinaId: l.disciplinaId,
      ehResumo: l._count.filhas > 0,
      ordem: l.ordem,
    })),
    previstas,
    apontados: [...somados.values()],
    disciplinas: disciplinas.map((d) => ({ id: d.id, nome: d.catalogo?.nome ?? d.disciplinaTextoLegado ?? "Disciplina" })),
    pessoas: pessoas.map((p) => ({ id: p.id, nome: p.name })),
    ...(opcoes.verCusto ? { custoHora: Object.fromEntries(recursos.map((r) => [r.userId, Number(r.custoHora)])) } : {}),
  };
}
