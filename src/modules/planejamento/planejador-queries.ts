import "server-only";

import { prisma } from "@/lib/prisma";
import type { Dia } from "@/lib/calendario-trabalho";
import { diaLocal } from "@/modules/ponto/engine";
import { escopoProjeto } from "@/modules/projetos/queries";
import type { ActionContext } from "@/lib/with-action";
import { cargaDaEquipe } from "./recursos-queries";
import { montarCalendarioComNomes } from "./agenda";
import {
  DIAS_DA_ESCALA,
  janelaDoPlanejador,
  montarPlanejador,
  type EscalaPlanejador,
  type FiltrosDoPlanejador,
  type Planejador,
} from "./planejador-equipe";

type Viewer = ActionContext["user"];

/** Dedicação de uma pessoa numa disciplina de um projeto, para editar na tela por pessoa (decisão 5). */
export type DedicacaoNaTela = { disciplinaId: string; rotulo: string; dedicacao: number | null; padrao: number };

export type PlanejadorDaTela = Planejador & {
  janela: { de: Dia; ate: Dia };
  escala: EscalaPlanejador;
  hoje: Dia;
  /** Feriados e recesso da janela (fim de semana não entra: a grade da tela já o pinta). */
  feriados: { dia: Dia; nome: string }[];
  /** Só para quem monta a EAP (`planejamento:gerir`), e só das disciplinas de projetos que a pessoa enxerga. */
  dedicacoes: Record<string, DedicacaoNaTela[]> | null;
  /** Todas as pessoas da carga, para o filtro (a lista não encolhe quando uma está escolhida). */
  pessoas: { userId: string; nome: string }[];
};

/**
 * Tudo o que a tela por pessoa (`/recursos/por-pessoa`) desenha. A carga é a MESMA de `cargaDaEquipe` (aprovados pelas
 * linhas, rascunhos à parte, sem alocação digitada), com as sobrecargas por dia contando os rascunhos (decisão J: a tela
 * mostra tudo, e o rascunho aparece identificado).
 */
export async function planejadorDaEquipe(
  viewer: Viewer,
  opcoes: { escala: EscalaPlanejador; inicio?: Dia; filtros?: FiltrosDoPlanejador; editarDedicacao: boolean },
): Promise<PlanejadorDaTela> {
  const hoje = diaLocal(new Date());
  const janela = janelaDoPlanejador(opcoes.escala, opcoes.inicio ?? hoje);
  const carga = await cargaDaEquipe({
    semanas: DIAS_DA_ESCALA[opcoes.escala] / 7,
    hoje: janela.de,
    incluirDigitada: false,
    diario: { desde: janela.de, comRascunhos: true },
    comLinhas: true,
  });
  const planejador = montarPlanejador({
    linhas: carga.linhasAgendadas,
    pessoas: carga.pessoas.map((p) => ({ userId: p.userId, nome: p.nome, horasPorDia: p.horasPorDia, disciplinas: p.disciplinas })),
    sobrecargas: carga.sobrecargasDiarias,
    projetos: carga.rotulos.projetos,
    linhasNomes: carga.rotulos.linhas,
    janela,
    filtros: opcoes.filtros,
  });

  // O mesmo calendário que agenda as linhas (feriados importados + nacionais calculados + recesso).
  const { nomes } = await montarCalendarioComNomes([Number(janela.de.slice(0, 4)), Number(janela.ate.slice(0, 4))]);
  const feriados = [...nomes].filter(([d]) => d >= janela.de && d <= janela.ate).map(([d, nome]) => ({ dia: d, nome }));

  let dedicacoes: Record<string, DedicacaoNaTela[]> | null = null;
  if (opcoes.editarDedicacao) {
    const userIds = planejador.faixas.map((f) => f.userId);
    const projetoIds = planejador.projetos.map((p) => p.id);
    const linhas = await prisma.disciplinaResponsavel.findMany({
      where: { userId: { in: userIds }, disciplina: { projetoId: { in: projetoIds }, projeto: escopoProjeto(viewer) } },
      select: {
        userId: true,
        disciplinaId: true,
        dedicacao: true,
        disciplina: { select: { disciplinaTextoLegado: true, projeto: { select: { codigo: true } } } },
        user: { select: { recurso: { select: { capacidade: true } } } },
      },
      orderBy: [{ disciplina: { projeto: { codigo: "asc" } } }, { disciplina: { ordem: "asc" } }],
    });
    dedicacoes = {};
    for (const l of linhas) {
      (dedicacoes[l.userId] ??= []).push({
        disciplinaId: l.disciplinaId,
        rotulo: `${l.disciplina.projeto.codigo} · ${l.disciplina.disciplinaTextoLegado}`,
        dedicacao: l.dedicacao,
        padrao: Math.round(Number(l.user.recurso?.capacidade ?? 1) * 100),
      });
    }
  }

  return {
    ...planejador,
    janela,
    escala: opcoes.escala,
    hoje,
    feriados,
    dedicacoes,
    pessoas: carga.pessoas.map((p) => ({ userId: p.userId, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}
