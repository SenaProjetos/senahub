import "server-only";
import { prisma } from "@/lib/prisma";
import { acessoGlobal, type Role, type EscopoDeDados } from "@/lib/roles";
import { whereAudiencia } from "@/lib/audiencias";
import { escopoProjeto } from "@/modules/projetos/queries";
import { progressoDoStatus } from "@/modules/projetos/status";
import { diaLocal, minutosPorDiaSessao } from "@/modules/ponto/engine";
import { gradesEmLote } from "@/modules/rh/escalas/queries";
import { chaveSemanaIso, diaEstaNaFaixa, minutosDisponiveisNoDia, percentualAlocadoNoDia } from "@/modules/planejamento/disponibilidade";
import { montarCalendario, planoDoProjeto, type PlanoDoProjeto } from "@/modules/planejamento/agenda";
import type { Prisma } from "@/generated/prisma/client";
import { cargaDaEquipe } from "@/modules/planejamento/recursos-queries";
import { ehEtapaDeTerceiro, ROTULO_PAPEL } from "@/modules/planejamento/recursos";
import { contextoDeArquivos, sugerirProgresso } from "@/modules/planejamento/progresso-sugerido";
import { minutosSessao } from "@/modules/ponto/format";

type Viewer = { id: string; role: Role; ehSocio?: boolean } & EscopoDeDados;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * O `include` de linha que o mapeador precisa — UM só, usado pelas duas queries. Antes cada
 * uma repetia o seu, e é assim que o DTO do Gantt diverge entre a EAP e o Painel Mestre.
 */
const INCLUDE_LINHA = {
  disciplina: { select: { id: true, disciplinaTextoLegado: true, status: true } },
  predecessoras: { select: { predecessoraId: true, tipo: true, lagDias: true } },
  origem: { select: { sigla: true } },
  // F5: quem está na linha. Principal primeiro — é quem a tela mostra quando cabe um só.
  atribuicoes: {
    select: {
      id: true,
      userId: true,
      papel: true,
      horasPrevistas: true,
      principal: true,
      user: { select: { name: true, image: true } },
    },
    orderBy: [{ principal: "desc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.EapTarefaInclude;

type EapTarefaComRelacoes = Prisma.EapTarefaGetPayload<{ include: typeof INCLUDE_LINHA }>;

/**
 * O que o sistema já sabe sobre cada linha e a tela usa para SUGERIR o % e mostrar o apontado
 * (F6). Só a EAP do projeto carrega isto (3 leituras em lote); o Painel Mestre não precisa e
 * recebe o vazio.
 */
type ApoioDaLinha = {
  /** Minutos apontados no ponto, por linha (via card gerado dela). */
  apontadoMin: Map<string, number>;
  /** Checklist do card gerado da linha. */
  checklist: Map<string, { feitos: number; total: number }>;
  /** Arquivos enviados por disciplina. */
  arquivosPorDisciplina: Map<string, number>;
};

const SEM_APOIO: ApoioDaLinha = { apontadoMin: new Map(), checklist: new Map(), arquivosPorDisciplina: new Map() };

async function carregarApoioDasLinhas(linhas: readonly { id: string; disciplinaId: string | null }[]): Promise<ApoioDaLinha> {
  const linhaIds = linhas.map((l) => l.id);
  const disciplinaIds = [...new Set(linhas.map((l) => l.disciplinaId).filter((d): d is string => d != null))];
  const [cards, sessoes, arquivos] = await Promise.all([
    prisma.tarefa.findMany({
      where: { eapTarefaId: { in: linhaIds } },
      select: { eapTarefaId: true, itens: { select: { concluido: true } } },
    }),
    prisma.sessaoTrabalho.findMany({
      where: { tarefa: { eapTarefaId: { in: linhaIds } } },
      select: { inicio: true, fim: true, tarefa: { select: { eapTarefaId: true } } },
    }),
    disciplinaIds.length === 0
      ? Promise.resolve([])
      : prisma.upload.groupBy({
          by: ["disciplinaId"],
          where: { disciplinaId: { in: disciplinaIds }, excluidoEm: null },
          _count: { _all: true },
        }),
  ]);

  const apoio: ApoioDaLinha = { apontadoMin: new Map(), checklist: new Map(), arquivosPorDisciplina: new Map() };
  for (const c of cards) {
    if (c.eapTarefaId) {
      apoio.checklist.set(c.eapTarefaId, { feitos: c.itens.filter((i) => i.concluido).length, total: c.itens.length });
    }
  }
  const agora = new Date();
  for (const ss of sessoes) {
    const id = ss.tarefa?.eapTarefaId;
    if (id) apoio.apontadoMin.set(id, (apoio.apontadoMin.get(id) ?? 0) + minutosSessao(ss.inicio, ss.fim ?? agora));
  }
  for (const a of arquivos) apoio.arquivosPorDisciplina.set(a.disciplinaId, a._count._all);
  return apoio;
}

/**
 * Mapeador único do DTO de linha da EAP. Existe pra `eapDoProjeto` e
 * `cronogramaProjetosAtivos` nunca divergirem de novo — as duas alimentam o mesmo `Gantt`.
 */
function mapearTarefaDTO(t: EapTarefaComRelacoes, plano: PlanoDoProjeto | null, apoio: ApoioDaLinha = SEM_APOIO) {
  const agendada = plano?.resultado.linhas.get(t.id);
  const apontadoMin = apoio.apontadoMin.get(t.id) ?? 0;
  return {
    id: t.id,
    idCorporativo: t.idCorporativo,
    codigoEap: t.codigoEap,
    parentId: t.parentId,
    nome: t.nome,
    ordem: t.ordem,
    // P-33: progresso derivado do status da disciplina vinculada; manual quando sem disciplina.
    progresso: t.disciplina ? progressoDoStatus(t.disciplina.status) : t.progresso,
    progressoDerivado: t.disciplina != null,
    inicioPrevisto: iso(t.inicioPrevisto),
    fimPrevisto: iso(t.fimPrevisto),
    inicioBaseline: t.inicioBaseline ? iso(t.inicioBaseline) : null,
    fimBaseline: t.fimBaseline ? iso(t.fimBaseline) : null,
    disciplinaId: t.disciplinaId,
    disciplinaNome: t.disciplina?.disciplinaTextoLegado ?? null,
    predecessoraIds: t.predecessoras.map((p) => p.predecessoraId),
    // Detalhe completo do vínculo (tipo + lag), pra tela editar sem outra ida ao banco.
    predecessoras: t.predecessoras.map((p) => ({
      predecessoraId: p.predecessoraId,
      tipo: p.tipo,
      lagDias: Number(p.lagDias),
    })),
    // `marco` é DERIVADO de tipoEap (F0): a natureza da linha vive no TEAP, não
    // num booleano paralelo. O contrato da UI segue o mesmo, como `progressoDerivado`.
    marco: t.tipoEap === "mrc",
    tipoEap: t.tipoEap,
    duracaoDias: Number(t.duracaoDias),
    status: t.status,
    restricaoTipo: t.restricaoTipo,
    restricaoData: t.restricaoData ? iso(t.restricaoData) : null,
    motivoBloqueio: t.motivoBloqueio,
    previsaoDesbloqueio: t.previsaoDesbloqueio ? iso(t.previsaoDesbloqueio) : null,
    // Criticidade e folga vêm do MOTOR, não do cliente: calcular no navegador voltaria
    // a contar dias corridos, porque o feriado só existe no banco.
    critica: plano?.resultado.criticas.has(t.id) ?? false,
    folgaTotal: agendada?.folgaTotal ?? 0,
    folgaLivre: agendada?.folgaLivre ?? 0,
    conflitoRestricao: agendada?.conflitoRestricao ?? false,
    // ── F5: recursos na linha ──
    /** Linha com filhos — não recebe gente (as horas estão nos filhos). */
    ehResumo: agendada?.ehResumo ?? false,
    /** Etapa de terceiro (origem externa): não gera card nem cobra hora. */
    deTerceiro: ehEtapaDeTerceiro(t.origem?.sigla),
    /** Horas da linha pelo motor — no resumo, a soma; `null` = alguma folha sem estimativa. */
    trabalhoHoras: agendada?.trabalhoHoras ?? null,
    atribuicoes: t.atribuicoes.map((a) => ({
      id: a.id,
      /** `null` = perfil (recurso genérico). */
      userId: a.userId,
      nome: a.user?.name ?? null,
      image: a.user?.image ?? null,
      papel: a.papel,
      rotuloPapel: ROTULO_PAPEL[a.papel],
      horas: Number(a.horasPrevistas),
      principal: a.principal,
    })),
    // ── F6: o que o ponto e o card já sabem desta linha ──
    /** Horas APONTADAS no ponto nesta linha (via o card gerado dela); o "real" do previsto × real. */
    horasApontadas: Math.round((apontadoMin / 60) * 10) / 10,
    /**
     * O que o sistema sugere para o % (checklist do card, situação da disciplina) — o
     * coordenador confirma, nunca grava sozinho (D19). Horas apontadas NÃO viram sugestão: ver
     * `progresso-sugerido.ts`.
     */
    sugestoesProgresso: sugerirProgresso({
      checklist: apoio.checklist.get(t.id) ?? null,
      progressoDoStatusDaDisciplina: t.disciplina ? progressoDoStatus(t.disciplina.status) : null,
    }),
    /** Contexto de arquivos (só texto): enviar não é entregar. */
    contextoArquivos: t.disciplinaId ? contextoDeArquivos(apoio.arquivosPorDisciplina.get(t.disciplinaId) ?? 0) : null,
  };
}

/** Projetos visíveis ao viewer + resumo do plano (página índice de Planejamento). */
export async function projetosComPlano(viewer: Viewer) {
  const projetos = await prisma.projeto.findMany({
    where: escopoProjeto(viewer),
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: {
      id: true,
      codigo: true,
      nome: true,
      situacao: true,
      eapTarefas: {
        select: { inicioPrevisto: true, fimPrevisto: true, progresso: true, disciplina: { select: { status: true } } },
      },
    },
  });
  return projetos.map((p) => {
    const t = p.eapTarefas;
    const inicio = t.length ? new Date(Math.min(...t.map((x) => x.inicioPrevisto.getTime()))) : null;
    const fim = t.length ? new Date(Math.max(...t.map((x) => x.fimPrevisto.getTime()))) : null;
    const progresso = t.length
      ? Math.round(t.reduce((s, x) => s + (x.disciplina ? progressoDoStatus(x.disciplina.status) : x.progresso), 0) / t.length)
      : 0;
    return {
      id: p.id,
      codigo: p.codigo,
      nome: p.nome,
      situacao: p.situacao,
      totalTarefas: t.length,
      inicio: inicio ? iso(inicio) : null,
      fim: fim ? iso(fim) : null,
      progresso,
    };
  });
}

/** Um projeto pode ser visto pelo viewer? (escopo). */
export async function projetoVisivel(viewer: Viewer, projetoId: string) {
  if (acessoGlobal(viewer)) {
    return prisma.projeto.findUnique({
      where: { id: projetoId },
      select: { id: true, codigo: true, nome: true, tipo: true, ano: true, sequencial: true },
    });
  }
  return prisma.projeto.findFirst({
    where: { AND: [{ id: projetoId }, escopoProjeto(viewer)] },
    // `ano`/`sequencial`: o motor de nomenclatura compara o código lido do nome do arquivo com
    // o do projeto (ano de 2 dígitos + sequencial) para avisar sobre arquivo de outro projeto.
    select: { id: true, codigo: true, nome: true, tipo: true, ano: true, sequencial: true },
  });
}

/** EAP completa de um projeto (lista plana ordenada por hierarquia; árvore montada no client). */
export async function eapDoProjeto(projetoId: string) {
  const tarefas = await prisma.eapTarefa.findMany({
    where: { projetoId },
    orderBy: { ordem: "asc" },
    include: INCLUDE_LINHA,
  });
  const disciplinas = await prisma.disciplina.findMany({
    where: { projetoId },
    orderBy: { ordem: "asc" },
    select: { id: true, disciplinaTextoLegado: true },
  });
  // O motor roda sobre o estado ATUAL do banco e não grava nada: a tela mostra folga e
  // caminho crítico corretos mesmo antes de alguém clicar em "reagendar".
  const [plano, apoio] = await Promise.all([planoDoProjeto(projetoId), carregarApoioDasLinhas(tarefas)]);
  return {
    tarefas: tarefas.map((t) => mapearTarefaDTO(t, plano, apoio)),
    // Volta a se chamar `nome` na fronteira da UI (`EapWorkspace` fala "nome"): a F1.19c
    // renomeou a coluna no schema, não o rótulo exibido.
    disciplinas: disciplinas.map((d) => ({ id: d.id, nome: d.disciplinaTextoLegado })),
    temLinhaBase: tarefas.some((t) => t.inicioBaseline != null),
  };
}

export type EapTarefaDTO = Awaited<ReturnType<typeof eapDoProjeto>>["tarefas"][number];

/** Cronograma consolidado: projetos com EAP (qualquer situação) + suas tarefas/linha de base. */
export async function cronogramaProjetosAtivos() {
  const projetos = await prisma.projeto.findMany({
    where: { eapTarefas: { some: {} } },
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: {
      id: true,
      codigo: true,
      nome: true,
      situacao: true,
      eapTarefas: {
        orderBy: { ordem: "asc" },
        include: INCLUDE_LINHA,
      },
    },
  });
  // Um motor por projeto: o calendário é o mesmo, mas a âncora e o grafo não. Rodar em
  // paralelo mantém a tela consolidada no mesmo custo de antes.
  const planos = new Map(
    await Promise.all(
      projetos.map(async (p) => [p.id, await planoDoProjeto(p.id)] as const),
    ),
  );
  return projetos.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    situacao: p.situacao,
    temLinhaBase: p.eapTarefas.some((t) => t.inicioBaseline != null),
    tarefas: p.eapTarefas.map((t) => mapearTarefaDTO(t, planos.get(p.id) ?? null)),
  }));
}

/**
 * P-28: plano × real do projeto no mês corrente — alocação planejada (%) por pessoa
 * vs. horas reais lançadas no projeto (SessaoTrabalho). Inclui quem trabalhou sem
 * alocação (percentual 0) para revelar esforço não planejado.
 */
export async function planoVsRealProjeto(projetoId: string) {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = agora.getMonth() + 1;
  const inicioIso = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimIso = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
  // Alocação tem vigência por data; sessão tem horário local de Brasília.
  const inicioVigencia = new Date(`${inicioIso}T00:00:00Z`);
  const fimVigencia = new Date(`${fimIso}T00:00:00Z`);
  const inicioSessao = new Date(`${inicioIso}T00:00:00-03:00`);
  const fimSessao = new Date(`${fimIso}T00:00:00-03:00`);

  const [alocacoes, sessoes] = await Promise.all([
    prisma.alocacao.findMany({
      where: {
        projetoId,
        AND: [{ OR: [{ inicio: null }, { inicio: { lt: fimVigencia } }] }, { OR: [{ fim: null }, { fim: { gte: inicioVigencia } }] }],
      },
      include: { recurso: { include: { user: { select: { id: true, name: true } } } } },
    }),
    prisma.sessaoTrabalho.findMany({
      where: {
        projetoId,
        inicio: { lt: fimSessao },
        OR: [{ fim: { gte: inicioSessao } }, { fim: null }],
      },
      select: { userId: true, inicio: true, fim: true },
    }),
  ]);

  const horasPorUser = new Map<string, number>();
  for (const s of sessoes) {
    let minutosNoMes = 0;
    for (const [dia, minutos] of minutosPorDiaSessao(s.inicio, s.fim, agora)) {
      if (dia >= inicioIso && dia < fimIso) minutosNoMes += minutos;
    }
    horasPorUser.set(s.userId, (horasPorUser.get(s.userId) ?? 0) + minutosNoMes);
  }

  const diasDoMes = Array.from({ length: new Date(ano, mes, 0).getDate() }, (_, indice) => {
    return `${ano}-${String(mes).padStart(2, "0")}-${String(indice + 1).padStart(2, "0")}`;
  }).filter((dia) => dia >= inicioIso && dia < fimIso);
  const alocacoesPorUser = new Map<string, typeof alocacoes>();
  for (const alocacao of alocacoes) {
    const userId = alocacao.recurso.user.id;
    alocacoesPorUser.set(userId, [...(alocacoesPorUser.get(userId) ?? []), alocacao]);
  }
  const linhas = [...alocacoesPorUser.entries()].map(([userId, alocacoesDaPessoa]) => ({
    userId,
    nome: alocacoesDaPessoa[0].recurso.user.name,
    percentual: Math.max(0, ...diasDoMes.map((dia) => percentualAlocadoNoDia(dia, alocacoesDaPessoa.map((a) => ({
      inicio: a.inicio ? iso(a.inicio) : null,
      fim: a.fim ? iso(a.fim) : null,
      percentual: a.percentual,
    }))))),
    horasReais: Math.round(((horasPorUser.get(userId) ?? 0) / 60) * 10) / 10,
  }));

  // Quem trabalhou no projeto sem alocação planejada.
  const comAloc = new Set(linhas.map((l) => l.userId));
  const semAloc = [...horasPorUser.keys()].filter((id) => !comAloc.has(id));
  if (semAloc.length > 0) {
    const users = await prisma.user.findMany({ where: { id: { in: semAloc } }, select: { id: true, name: true } });
    const nome = new Map(users.map((u) => [u.id, u.name]));
    for (const id of semAloc) {
      linhas.push({
        userId: id,
        nome: nome.get(id) ?? "—",
        percentual: 0,
        horasReais: Math.round(((horasPorUser.get(id) ?? 0) / 60) * 10) / 10,
      });
    }
  }

  linhas.sort((a, b) => b.horasReais - a.horasReais || a.nome.localeCompare(b.nome));
  const totalHoras = Math.round(linhas.reduce((s, l) => s + l.horasReais, 0) * 10) / 10;
  return { ano, mes, linhas, totalHoras };
}

/**
 * N-33: Horas reais trabalhadas por pessoa × semana (SessaoTrabalho).
 * Retorna as últimas `semanas` semanas + nomes dos recursos.
 * Cada semana = chave ISO "YYYY-Www". Horas arredondadas a 1 decimal.
 */
export async function cargaSemanalPorRecurso(semanas = 12) {
  const agora = new Date();
  const hoje = diaLocal(agora);
  const inicioSemanaAtual = inicioDaSemana(hoje);
  const inicio = adicionarDias(inicioSemanaAtual, -7 * (semanas - 1));
  const fimExclusivo = adicionarDias(inicioSemanaAtual, 7);
  const chavesSemana = Array.from({ length: semanas }, (_, indice) => chaveSemanaIso(adicionarDias(inicio, indice * 7)));
  const inicioSessao = new Date(`${inicio}T00:00:00-03:00`);
  const fimSessao = new Date(`${fimExclusivo}T00:00:00-03:00`);
  const inicioVigencia = new Date(`${inicio}T00:00:00Z`);
  const fimVigencia = new Date(`${fimExclusivo}T00:00:00Z`);

  const recursos = await prisma.recurso.findMany({
    where: { ativo: true },
    select: {
      capacidade: true,
      user: { select: { id: true, name: true, image: true, contratacao: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  if (recursos.length === 0) return { semanas: chavesSemana, linhas: [] };

  const userIds = recursos.map((recurso) => recurso.user.id);
  const [sessoes, grades, calendario, ferias, abonos] = await Promise.all([
    prisma.sessaoTrabalho.findMany({
      where: {
        userId: { in: userIds },
        inicio: { lt: fimSessao },
        OR: [{ fim: { gte: inicioSessao } }, { fim: null }],
      },
      select: { userId: true, inicio: true, fim: true },
      orderBy: { inicio: "asc" },
    }),
    gradesEmLote(recursos.map((recurso) => ({ id: recurso.user.id, contratacao: recurso.user.contratacao }))),
    // O MESMO calendário do cronograma e da carga planejada (F5): lido direto da tabela
    // `Feriado`, um ano sem feriado importado daria capacidade diferente da planejada.
    montarCalendario([Number(inicio.slice(0, 4)), Number(fimExclusivo.slice(0, 4))]),
    prisma.ferias.findMany({
      where: { userId: { in: userIds }, status: "aprovado", inicio: { lt: fimVigencia }, fim: { gte: inicioVigencia } },
      select: { userId: true, inicio: true, fim: true },
    }),
    prisma.abonoFalta.findMany({
      where: { userId: { in: userIds }, status: "aprovado", dataInicio: { lt: fimVigencia }, dataFim: { gte: inicioVigencia } },
      select: { userId: true, dataInicio: true, dataFim: true },
    }),
  ]);

  const feriados = calendario.feriados;
  const ausenciasPorUsuario = new Map<string, Set<string>>();
  for (const ausencia of [...ferias.map((f) => ({ userId: f.userId, inicio: f.inicio, fim: f.fim })), ...abonos.map((a) => ({ userId: a.userId, inicio: a.dataInicio, fim: a.dataFim }))]) {
    const dias = ausenciasPorUsuario.get(ausencia.userId) ?? new Set<string>();
    for (let dia = iso(ausencia.inicio); dia <= iso(ausencia.fim); dia = adicionarDias(dia, 1)) {
      if (dia >= inicio && dia < fimExclusivo) dias.add(dia);
    }
    ausenciasPorUsuario.set(ausencia.userId, dias);
  }

  const minutosPorUsuarioSemana = new Map<string, Map<string, number>>();
  for (const sessao of sessoes) {
    const porSemana = minutosPorUsuarioSemana.get(sessao.userId) ?? new Map<string, number>();
    for (const [dia, minutos] of minutosPorDiaSessao(sessao.inicio, sessao.fim, agora)) {
      if (dia < inicio || dia >= fimExclusivo) continue;
      const semana = chaveSemanaIso(dia);
      porSemana.set(semana, (porSemana.get(semana) ?? 0) + minutos);
    }
    minutosPorUsuarioSemana.set(sessao.userId, porSemana);
  }

  const arredondar = (minutos: number) => Math.round((minutos / 60) * 10) / 10;
  const linhas = recursos.map((recurso) => {
    const porSemana: Record<string, number> = {};
    const capacidadePorSemana: Record<string, number> = {};
    const grade = grades.get(recurso.user.id) ?? [];
    const ausencias = ausenciasPorUsuario.get(recurso.user.id) ?? new Set<string>();
    const realizado = minutosPorUsuarioSemana.get(recurso.user.id) ?? new Map<string, number>();
    for (let dia = inicio; dia < fimExclusivo; dia = adicionarDias(dia, 1)) {
      const semana = chaveSemanaIso(dia);
      const diaDaSemana = new Date(`${dia}T00:00:00Z`).getUTCDay();
      const jornada = grade.find((item) => item.diaSemana === diaDaSemana);
      const minutosDisponiveis = minutosDisponiveisNoDia(
        jornada?.ativo ? jornada.horasDia * 60 : 0,
        Number(recurso.capacidade),
        feriados.has(dia) || ausencias.has(dia),
      );
      capacidadePorSemana[semana] = (capacidadePorSemana[semana] ?? 0) + minutosDisponiveis;
    }
    for (const semana of chavesSemana) {
      porSemana[semana] = arredondar(realizado.get(semana) ?? 0);
      capacidadePorSemana[semana] = arredondar(capacidadePorSemana[semana] ?? 0);
    }
    return { userId: recurso.user.id, nome: recurso.user.name, image: recurso.user.image, porSemana, capacidadePorSemana };
  });

  return { semanas: chavesSemana, linhas };
}

function adicionarDias(dia: string, quantidade: number): string {
  const [ano, mes, diaDoMes] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, diaDoMes + quantidade)).toISOString().slice(0, 10);
}

function inicioDaSemana(dia: string): string {
  const [ano, mes, diaDoMes] = dia.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, diaDoMes));
  return adicionarDias(dia, -((data.getUTCDay() + 6) % 7));
}

/**
 * Matriz de recursos: pessoas (recursos) × projetos.
 * P-29: superalocação considera só as alocações ATIVAS hoje (respeita inicio/fim).
 * P-30: capacidade efetiva desconta ausências de hoje (férias/abono aprovados, feriado).
 *
 * F5 (D17) — a matriz vira CÁLCULO nos projetos com cronograma aprovado: o percentual sai
 * das horas das atribuições na semana corrente, sobre a semana útil da pessoa (a mesma
 * régua do "50%" digitado). A alocação digitada desses projetos continua listada, marcada
 * `substituidaPeloCronograma`, e SAI da soma — senão a mesma hora contaria duas vezes (os
 * "50% na matriz e 120% nas tarefas" da Q17). Projeto sem cronograma aprovado segue com a
 * alocação digitada, como sempre.
 */
export async function matrizRecursos() {
  const hojeIso = diaLocal(new Date());

  const [recursos, projetos, usuariosSemRecurso, ferias, abonos, feriados, carga] = await Promise.all([
    prisma.recurso.findMany({
      where: { ativo: true },
      include: {
        user: { select: { id: true, name: true, role: true, image: true } },
        alocacoes: {
          include: { projeto: { select: { id: true, codigo: true, nome: true } } },
        },
      },
    }),
    prisma.projeto.findMany({
      where: { situacao: { in: ["em_andamento", "concluido"] } },
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, codigo: true, nome: true },
    }),
    prisma.user.findMany({
      where: { ...whereAudiencia("planejamento_recurso"), recurso: null },
      select: { id: true, name: true, role: true, image: true },
      orderBy: { name: "asc" },
    }),
    prisma.ferias.findMany({
      where: { status: "aprovado" },
      select: { userId: true, inicio: true, fim: true },
    }),
    prisma.abonoFalta.findMany({
      where: { status: "aprovado" },
      select: { userId: true, dataInicio: true, dataFim: true },
    }),
    prisma.feriado.findMany({ select: { data: true, nome: true } }),
    cargaDaEquipe({ semanas: 1, hoje: hojeIso }),
  ]);

  const calculados = new Set(carga.projetosCalculados);
  const semanaAtual = carga.semanas[0];
  const cargaPorUser = new Map(carga.pessoas.map((p) => [p.userId, p]));
  const projetoPorId = new Map(projetos.map((p) => [p.id, p]));

  // Motivo de ausência de hoje por usuário (feriado afeta todos).
  const ausenciaPorUser = new Map<string, string>();
  for (const f of ferias) {
    if (diaEstaNaFaixa(hojeIso, { inicio: iso(f.inicio), fim: iso(f.fim) })) ausenciaPorUser.set(f.userId, "férias");
  }
  for (const a of abonos) {
    if (!ausenciaPorUser.has(a.userId) && diaEstaNaFaixa(hojeIso, { inicio: iso(a.dataInicio), fim: iso(a.dataFim) })) {
      ausenciaPorUser.set(a.userId, "abono");
    }
  }
  const feriadoHoje = feriados.find((feriado) => iso(feriado.data) === hojeIso)?.nome ?? null;

  const ativaHoje = (a: { inicio: Date | null; fim: Date | null }) =>
    diaEstaNaFaixa(hojeIso, {
      inicio: a.inicio ? iso(a.inicio) : null,
      fim: a.fim ? iso(a.fim) : null,
    });

  const linhas = recursos
    .map((r) => {
      const capacidadePct = Math.round(Number(r.capacidade) * 100);
      // Horas da semana corrente em cada projeto aprovado, sobre a semana útil da pessoa.
      const cargaPessoa = cargaPorUser.get(r.user.id);
      const base = cargaPessoa?.semanaUtil[semanaAtual] ?? 0;
      const calculadas = Object.entries(cargaPessoa?.porProjeto ?? {})
        .filter(([projetoId]) => calculados.has(projetoId))
        .map(([projetoId, porSemana]) => {
          const horasSemana = porSemana[semanaAtual] ?? 0;
          const projeto = projetoPorId.get(projetoId);
          return {
            projetoId,
            projetoCodigo: projeto?.codigo ?? "",
            projetoNome: projeto?.nome ?? "",
            horasSemana,
            // Sem semana útil (jornada vazia), percentual não tem base: fica nulo em vez de
            // inventar. A sobrecarga de `cargaDaEquipe`, em horas, continua acusando.
            percentual: base > 0 ? Math.round((horasSemana / base) * 100) : null,
          };
        })
        .filter((c) => c.horasSemana > 0);
      const alocadoHoje =
        r.alocacoes.filter((a) => ativaHoje(a) && !calculados.has(a.projetoId)).reduce((s, a) => s + a.percentual, 0) +
        calculadas.reduce((s, c) => s + (c.percentual ?? 0), 0);
      const motivoAusencia = feriadoHoje ? `feriado (${feriadoHoje})` : (ausenciaPorUser.get(r.user.id) ?? null);
      const ausente = motivoAusencia != null;
      const capacidadeEfetivaPct = ausente ? 0 : capacidadePct;
      const indisponibilidades = [
        ...ferias
          .filter((f) => f.userId === r.user.id)
          .map((f) => ({ inicio: iso(f.inicio), fim: iso(f.fim), motivo: "férias" })),
        ...abonos
          .filter((a) => a.userId === r.user.id)
          .map((a) => ({ inicio: iso(a.dataInicio), fim: iso(a.dataFim), motivo: "abono" })),
        ...feriados.map((f) => ({ inicio: iso(f.data), fim: iso(f.data), motivo: `feriado (${f.nome})` })),
      ];
      return {
        recursoId: r.id,
        userId: r.user.id,
        nome: r.user.name,
        image: r.user.image,
        role: r.user.role,
        capacidade: Number(r.capacidade),
        capacidadePct,
        capacidadeEfetivaPct,
        ausente,
        motivoAusencia,
        indisponibilidades,
        cor: r.cor,
        custoHora: r.custoHora != null ? Number(r.custoHora) : null,
        totalAlocado: alocadoHoje,
        alocadoHoje,
        // P-29: superalocação avalia a carga de HOJE contra a capacidade efetiva.
        superalocado: alocadoHoje > capacidadeEfetivaPct,
        alocacoes: r.alocacoes.map((a) => ({
          id: a.id,
          projetoId: a.projetoId,
          projetoCodigo: a.projeto.codigo,
          projetoNome: a.projeto.nome,
          percentual: a.percentual,
          inicio: a.inicio ? iso(a.inicio) : null,
          fim: a.fim ? iso(a.fim) : null,
          ativaHoje: ativaHoje(a),
          observacao: a.observacao,
          /** Projeto com cronograma aprovado: esta alocação digitada não conta mais (D17). */
          substituidaPeloCronograma: calculados.has(a.projetoId),
        })),
        /** Alocação calculada das linhas, nos projetos com cronograma aprovado (D17). */
        calculadas,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return { linhas, projetos, usuariosSemRecurso, feriadoHoje };
}

/**
 * Estado de governança do cronograma (F2): aprovado, Data de Status, âncora, versão de
 * baseline vigente. Tela usa isto para decidir "Aprovar" vs "Replanejar" e mostrar a
 * régua de apuração.
 */
export async function cronogramaProjetoInfo(projetoId: string) {
  const [cronograma, ultimaBaseline, alocacoesTipadas] = await Promise.all([
    prisma.cronogramaProjeto.findUnique({
      where: { projetoId },
      select: { aprovado: true, aprovadoEm: true, dataStatus: true, inicioProjeto: true },
    }),
    prisma.eapBaseline.findFirst({
      where: { projetoId },
      orderBy: { numero: "desc" },
      select: { numero: true, motivo: true, createdAt: true },
    }),
    // F5 (D17): quantas alocações DIGITADAS o projeto tem — aprovar sem hora estimada nas
    // linhas as tira da carga da equipe sem substituir por nada. A tela precisa avisar
    // ANTES de aprovar, não depois: `alocacoesSubstituidas` só existe no resultado.
    prisma.alocacao.count({ where: { projetoId } }),
  ]);
  return {
    aprovado: cronograma?.aprovado ?? false,
    aprovadoEm: cronograma?.aprovadoEm ? iso(cronograma.aprovadoEm) : null,
    dataStatus: cronograma?.dataStatus ? iso(cronograma.dataStatus) : null,
    inicioProjeto: cronograma?.inicioProjeto ? iso(cronograma.inicioProjeto) : null,
    ultimaBaseline: ultimaBaseline
      ? { numero: ultimaBaseline.numero, motivo: ultimaBaseline.motivo, criadaEm: iso(ultimaBaseline.createdAt) }
      : null,
    alocacoesTipadas,
  };
}

/** Pessoa ou perfil para atribuir numa linha da EAP (F5) — gente da casa, ativa. */
export async function pessoasParaAtribuicao() {
  return prisma.user.findMany({
    where: { ativo: true, role: { not: "cliente" } },
    select: { id: true, name: true, image: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Verificador de qualidade + Saúde do Cronograma, para RSC (`page.tsx`). Fino wrapper
 * sobre `avaliarQualidade` (service.ts): é leitura pura, mas a convenção do repo é a
 * página ler por `queries.ts` — mesmo padrão de `planoDoProjeto` sendo consumido aqui.
 */
export async function qualidadeDoProjeto(projetoId: string) {
  const { avaliarQualidade } = await import("@/modules/planejamento/service");
  return avaliarQualidade(projetoId);
}
