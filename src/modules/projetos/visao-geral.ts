import "server-only";

import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/roles";
import { STATUS_ABERTOS } from "@/modules/projetos/pendencias/helpers";
import { contarTarefasAbertasDoProjeto } from "@/modules/tarefas/queries";
import { STATUS_PENDENTES, TIPOS_CONTRATUAIS } from "@/modules/juridico/contrato/estado";

type Viewer = { id: string; role: Role };

type FontesPendencias = {
  incluirApontamentosPrancha: boolean;
  incluirCoordenacao: boolean;
  incluirTarefas: boolean;
};

/**
 * Agregados exclusivamente da Visão Geral. O chamador já confirma o escopo do projeto
 * antes desta query; as fontes cuja permissão não foi concedida não são consultadas.
 */
export async function visaoGeralProjeto(
  projetoId: string,
  viewer: Viewer,
  fontes: FontesPendencias,
) {
  const [
    riscos,
    tarefasEap,
    revisoesPendentesPorDisciplina,
    aprovacoesInternasPendentes,
    aceitesPendentes,
    apontamentosPrancha,
    apontamentosCoordenacao,
    tarefasAbertas,
    contratosPendentes,
  ] = await Promise.all([
    prisma.riscoProjeto.findMany({
      where: { projetoId },
      select: {
        id: true,
        descricao: true,
        probabilidade: true,
        impacto: true,
        mitigacao: true,
        status: true,
      },
    }),
    prisma.eapTarefa.findMany({
      where: { projetoId, disciplinaId: { not: null } },
      select: {
        disciplinaId: true,
        inicioPrevisto: true,
        fimPrevisto: true,
        progresso: true,
      },
    }),
    prisma.solicitacaoRevisao.groupBy({
      by: ["disciplinaId"],
      where: { disciplina: { projetoId }, status: "pendente" },
      _count: { _all: true },
    }),
    prisma.disciplina.count({
      where: { projetoId, aprovacaoSolicitadaEm: { not: null } },
    }),
    prisma.aceiteCliente.count({
      where: { situacao: "pendente", upload: { disciplina: { projetoId } } },
    }),
    fontes.incluirApontamentosPrancha
      ? prisma.pendencia.count({
          where: {
            projetoId,
            status: { in: [...STATUS_ABERTOS] },
            publicadoEm: { not: null },
            excluidoEm: null,
          },
        })
      : Promise.resolve(null),
    fontes.incluirCoordenacao
      ? prisma.apontamentoCoordenacao.count({ where: { projetoId, status: "aberta" } })
      : Promise.resolve(null),
    fontes.incluirTarefas
      ? contarTarefasAbertasDoProjeto(viewer, projetoId)
      : Promise.resolve(null),
    // Badge "contrato pendente" (spec 2026-08-26-gerenciador-contratos.md, Fase I). Allowlist
    // explícito (rascunho/aguardando_assinatura) em vez de `notIn: [assinado]` — um contrato
    // criado ANTES desta feature tem `statusContrato: null`, e não queremos que os 32 projetos
    // já existentes acendam o badge sem nunca terem passado por este fluxo.
    // `tipo` vem do predicado único: aditivo pendente também é pendência (Fase B2).
    prisma.documentoJuridico.count({
      where: {
        projetoId,
        tipo: { in: [...TIPOS_CONTRATUAIS] },
        statusContrato: { in: [...STATUS_PENDENTES] },
      },
    }),
  ]);

  const pendencias = {
    apontamentosPrancha,
    apontamentosCoordenacao,
    tarefas: tarefasAbertas,
    revisoes: revisoesPendentesPorDisciplina.reduce((total, revisao) => total + revisao._count._all, 0),
    aprovacoes: aprovacoesInternasPendentes + aceitesPendentes,
  };

  return {
    contratoPendente: contratosPendentes > 0,
    pendencias: {
      ...pendencias,
      total: Object.values(pendencias).reduce<number>((total, quantidade) => total + (quantidade ?? 0), 0),
    },
    riscos: riscos
      .sort((a, b) => {
        const scoreA = a.probabilidade * a.impacto;
        const scoreB = b.probabilidade * b.impacto;
        if ((a.status === "aberto") !== (b.status === "aberto")) return a.status === "aberto" ? -1 : 1;
        return scoreB - scoreA;
      })
      .slice(0, 3)
      .map((risco) => ({
        ...risco,
        score: risco.probabilidade * risco.impacto,
      })),
    tarefasEap: tarefasEap.map((tarefa) => ({
      disciplinaId: tarefa.disciplinaId!,
      inicioPrevisto: tarefa.inicioPrevisto.toISOString(),
      fimPrevisto: tarefa.fimPrevisto.toISOString(),
      progresso: tarefa.progresso,
    })),
    revisoesPendentesPorDisciplina: revisoesPendentesPorDisciplina.map((revisao) => ({
      disciplinaId: revisao.disciplinaId,
      quantidade: revisao._count._all,
    })),
  };
}

export type VisaoGeralProjeto = Awaited<ReturnType<typeof visaoGeralProjeto>>;
