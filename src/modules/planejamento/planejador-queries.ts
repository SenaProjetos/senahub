import "server-only";

import { prisma } from "@/lib/prisma";
import type { Dia } from "@/lib/calendario-trabalho";
import { diaLocal } from "@/modules/ponto/engine";
import { escopoProjeto } from "@/modules/projetos/queries";
import type { ActionContext } from "@/lib/with-action";
import { cargaDaEquipe } from "./recursos-queries";
import { montarCalendarioComNomes, paraDia } from "./agenda";
import { ENCERRADA } from "./recursos";
import { parceirosParaEscolha } from "./parceiros/queries";
import {
  mapaDeSucessoras,
  resumoDasSeguintes,
  seguintesDaLinha,
  type EdicaoDoProjeto,
  type LinhaParaSeguintes,
  type SeguintesDaBarra,
} from "./planejador-acoes";
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
  /**
   * Arrastar (parte 4): só para quem monta cronograma (`planejamento:gerir`). Por projeto com barra na janela; projeto
   * fora do escopo vem `editavel: false` ("Sem permissão neste projeto").
   */
  edicao: Record<string, EdicaoDoProjeto> | null;
  /** As seguintes de cada linha editável (a pergunta "Mover também as seguintes?"). */
  seguintes: Record<string, SeguintesDaBarra> | null;
};

/**
 * Tudo o que a tela por pessoa (`/recursos/por-pessoa`) desenha. A carga é a MESMA de `cargaDaEquipe` (aprovados pelas
 * linhas, rascunhos à parte, sem alocação digitada), com as sobrecargas por dia contando os rascunhos (decisão J: a tela
 * mostra tudo, e o rascunho aparece identificado).
 */
export async function planejadorDaEquipe(
  viewer: Viewer,
  opcoes: { escala: EscalaPlanejador; inicio?: Dia; filtros?: FiltrosDoPlanejador; editarDedicacao: boolean; editarPlano?: boolean },
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
  const parceiros = await parceirosParaEscolha();
  const planejador = montarPlanejador({
    linhas: carga.linhasAgendadas,
    pessoas: carga.pessoas.map((p) => ({ userId: p.userId, nome: p.nome, horasPorDia: p.horasPorDia, disciplinas: p.disciplinas })),
    sobrecargas: carga.sobrecargasDiarias,
    projetos: carga.rotulos.projetos,
    linhasNomes: carga.rotulos.linhas,
    janela,
    filtros: opcoes.filtros,
    parceiros,
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

  let edicao: Record<string, EdicaoDoProjeto> | null = null;
  let seguintes: Record<string, SeguintesDaBarra> | null = null;
  if (opcoes.editarPlano) {
    const ids = planejador.projetos.map((p) => p.id);
    const noEscopo = new Set(
      (await prisma.projeto.findMany({ where: { AND: [{ id: { in: ids } }, escopoProjeto(viewer)] }, select: { id: true } })).map((p) => p.id),
    );
    const cronogramas = await prisma.cronogramaProjeto.findMany({ where: { projetoId: { in: ids } }, select: { projetoId: true, aprovado: true, emRevisao: true } });
    const coordeno = new Set(
      (
        await prisma.projetoMembro.findMany({
          where: { userId: viewer.id, projetoId: { in: ids }, papel: { contains: "coord", mode: "insensitive" } },
          select: { projetoId: true },
        })
      ).map((m) => m.projetoId),
    );
    edicao = {};
    for (const id of ids) {
      const c = cronogramas.find((x) => x.projetoId === id);
      // Fora do escopo, só "sem permissão": nem a situação do cronograma sai.
      edicao[id] = noEscopo.has(id)
        ? { editavel: true, aprovado: c?.aprovado ?? false, emRevisao: c?.emRevisao ?? false, souCoordenador: coordeno.has(id) }
        : { editavel: false, aprovado: false, emRevisao: false, souCoordenador: false };
    }

    const editaveis = [...noEscopo];
    const [vinculos, linhasDb] = await Promise.all([
      prisma.eapDependencia.findMany({ where: { tarefa: { projetoId: { in: editaveis } } }, select: { tarefaId: true, predecessoraId: true } }),
      prisma.eapTarefa.findMany({
        where: { projetoId: { in: editaveis } },
        select: { id: true, nome: true, status: true, inicioReal: true, restricaoData: true },
      }),
    ]);
    const linhas = new Map<string, LinhaParaSeguintes>(
      linhasDb.map((l) => [
        l.id,
        { id: l.id, nome: l.nome, restricaoData: l.restricaoData ? paraDia(l.restricaoData) : null, aberta: !ENCERRADA.has(l.status) && l.inicioReal == null },
      ]),
    );
    seguintes = {};
    const sucessoras = mapaDeSucessoras(vinculos);
    const barras = [...planejador.faixas.flatMap((f) => f.barras), ...planejador.parceiros.flatMap((f) => f.barras), ...planejador.semNinguem.barras];
    for (const b of barras) {
      if (!noEscopo.has(b.projetoId) || seguintes[b.linhaId]) continue;
      const s = seguintesDaLinha(b.linhaId, sucessoras, linhas);
      if (s.todas.length > 0) seguintes[b.linhaId] = resumoDasSeguintes(s, linhas);
    }
  }

  return {
    ...planejador,
    edicao,
    seguintes,
    janela,
    escala: opcoes.escala,
    hoje,
    feriados,
    dedicacoes,
    pessoas: carga.pessoas.map((p) => ({ userId: p.userId, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}
