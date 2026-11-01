import "server-only";

import { prisma } from "@/lib/prisma";
import { podeVerCusto } from "@/lib/custo-visivel";
import type { SubjectAutorizacao } from "@/lib/permissions";
import { minutosSessao } from "@/modules/ponto/format";
import { ehCoordenador } from "@/modules/projetos/papeis";
import { montarHorasPorDisciplina, type LinhaHoras } from "@/modules/projetos/horas-disciplina";

/**
 * Horas por disciplina do projeto (R5 do rateio; decisões 16 e 19): orçado = horas da PRIMEIRA linha de
 * base (só linhas-folha), planejado = horas das atribuições da EAP de hoje, realizado = sessões do ponto
 * com a disciplina. O que cada um vê é decidido aqui (servidor): coordenador vê por pessoa; os demais,
 * só as próprias e o total; reais só para quem pode ver custo. Quem chama já conferiu o acesso ao projeto.
 */
export async function horasPorDisciplina(
  viewer: SubjectAutorizacao & { ehSocio: boolean; perfilChave: string | null },
  projetoId: string,
): Promise<{ linhas: LinhaHoras[]; temLinhaDeBase: boolean; podeVerCusto: boolean }> {
  const [disciplinas, membro, primeiraBase, atribuicoes, sessoes, custoVisivel] = await Promise.all([
    prisma.disciplina.findMany({
      where: { projetoId },
      orderBy: { ordem: "asc" },
      select: { id: true, disciplinaTextoLegado: true, catalogo: { select: { nome: true } } },
    }),
    prisma.projetoMembro.findFirst({ where: { projetoId, userId: viewer.id }, select: { papel: true } }),
    prisma.eapBaseline.findFirst({ where: { projetoId }, orderBy: { numero: "asc" }, select: { id: true } }),
    prisma.eapAtribuicao.findMany({
      // Atribuição só existe em linha de atividade; resumo é soma e contaria duas vezes.
      where: { tarefa: { projetoId, tipoEap: "atv", disciplinaId: { not: null } } },
      select: { horasPrevistas: true, tarefa: { select: { disciplinaId: true } } },
    }),
    prisma.sessaoTrabalho.findMany({
      where: { projetoId, disciplinaId: { not: null } },
      select: { disciplinaId: true, userId: true, inicio: true, fim: true, user: { select: { name: true } } },
    }),
    podeVerCusto(viewer),
  ]);

  const orcado = primeiraBase
    ? (
        await prisma.eapBaselineLinha.findMany({
          where: { baselineId: primeiraBase.id, resumo: false, tarefa: { disciplinaId: { not: null } } },
          select: { trabalhoHoras: true, tarefa: { select: { disciplinaId: true } } },
        })
      ).map((l) => ({ disciplinaId: l.tarefa!.disciplinaId!, horas: Number(l.trabalhoHoras ?? 0) }))
    : null;

  const custo = custoVisivel
    ? (
        await prisma.rateioHora.groupBy({ by: ["disciplinaId"], where: { projetoId, disciplinaId: { not: null } }, _sum: { custo: true } })
      ).map((g) => ({ disciplinaId: g.disciplinaId!, cent: Math.round(Number(g._sum.custo ?? 0) * 100) }))
    : [];

  const linhas = montarHorasPorDisciplina({
    disciplinas: disciplinas.map((d) => ({ id: d.id, nome: d.catalogo?.nome ?? d.disciplinaTextoLegado ?? "Disciplina" })),
    orcado,
    planejado: atribuicoes.map((a) => ({ disciplinaId: a.tarefa.disciplinaId!, horas: Number(a.horasPrevistas) })),
    realizado: sessoes.map((s) => ({ disciplinaId: s.disciplinaId!, userId: s.userId, nome: s.user.name, minutos: minutosSessao(s.inicio, s.fim) })),
    custo,
    viewer: { userId: viewer.id, coordenador: ehCoordenador({ papelNoProjeto: membro?.papel ?? null, perfilChave: viewer.perfilChave }), podeVerCusto: custoVisivel },
  });
  return { linhas, temLinhaDeBase: !!primeiraBase, podeVerCusto: custoVisivel };
}
