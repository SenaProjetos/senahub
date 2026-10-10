import "server-only";

import { prisma } from "@/lib/prisma";
import { STATUS_ABERTOS } from "@/modules/projetos/pendencias/helpers";
import { ordenarRiscos } from "@/modules/projetos/riscos/regras";
import { solicitacoesRevisaoDoProjeto } from "@/modules/projetos/solicitacoes-revisao/queries";
import { emAbertoPorDisciplina } from "@/modules/projetos/solicitacoes-revisao/situacao";
import { contarTarefasAbertasDoProjeto } from "@/modules/tarefas/queries";
import { STATUS_PENDENTES, TIPOS_CONTRATUAIS } from "@/modules/juridico/contrato/estado";

type Viewer = { id: string; gereTodasTarefas: boolean };

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
    solicitacoesRevisao,
    aprovacoesInternasPendentes,
    aceitesPendentes,
    apontamentosPrancha,
    apontamentosCoordenacao,
    tarefasAbertas,
    contratosPendentes,
  ] = await Promise.all([
    prisma.riscoProjeto.findMany({
      where: { projetoId },
      orderBy: { createdAt: "asc" },
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
    solicitacoesRevisaoDoProjeto(projetoId),
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

  // Solicitação de revisão em aberto = rodada de apontamentos enviada com apontamento ainda aberto.
  const revisoesPorDisciplina = emAbertoPorDisciplina(solicitacoesRevisao);

  const pendencias = {
    apontamentosPrancha,
    apontamentosCoordenacao,
    tarefas: tarefasAbertas,
    revisoes: [...revisoesPorDisciplina.values()].reduce((total, quantidade) => total + quantidade, 0),
    aprovacoes: aprovacoesInternasPendentes + aceitesPendentes,
  };

  return {
    contratoPendente: contratosPendentes > 0,
    pendencias: {
      ...pendencias,
      total: Object.values(pendencias).reduce<number>((total, quantidade) => total + (quantidade ?? 0), 0),
    },
    // Todos, na ordem do registro: o painel destaca os primeiros e a janela "Ver todos" lista o resto.
    riscos: ordenarRiscos(riscos),
    tarefasEap: tarefasEap.map((tarefa) => ({
      disciplinaId: tarefa.disciplinaId!,
      inicioPrevisto: tarefa.inicioPrevisto.toISOString(),
      fimPrevisto: tarefa.fimPrevisto.toISOString(),
      progresso: tarefa.progresso,
    })),
    revisoesPendentesPorDisciplina: [...revisoesPorDisciplina].map(([disciplinaId, quantidade]) => ({ disciplinaId, quantidade })),
  };
}

export type VisaoGeralProjeto = Awaited<ReturnType<typeof visaoGeralProjeto>>;
