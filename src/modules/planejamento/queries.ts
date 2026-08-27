import "server-only";
import { prisma } from "@/lib/prisma";
import { acessoGlobal, type Role, type EscopoDeDados } from "@/lib/roles";
import { whereAudiencia } from "@/lib/audiencias";
import { escopoProjeto } from "@/modules/projetos/queries";
import { progressoDoStatus } from "@/modules/projetos/status";
import { diaLocal, minutosPorDiaSessao } from "@/modules/ponto/engine";
import { gradesEmLote } from "@/modules/rh/escalas/queries";
import { chaveSemanaIso, diaEstaNaFaixa, minutosDisponiveisNoDia, percentualAlocadoNoDia } from "@/modules/planejamento/disponibilidade";

type Viewer = { id: string; role: Role; ehSocio?: boolean } & EscopoDeDados;

const iso = (d: Date) => d.toISOString().slice(0, 10);

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
    return prisma.projeto.findUnique({ where: { id: projetoId }, select: { id: true, codigo: true, nome: true, tipo: true } });
  }
  return prisma.projeto.findFirst({
    where: { AND: [{ id: projetoId }, escopoProjeto(viewer)] },
    select: { id: true, codigo: true, nome: true, tipo: true },
  });
}

/** EAP completa de um projeto (lista plana ordenada por hierarquia; árvore montada no client). */
export async function eapDoProjeto(projetoId: string) {
  const tarefas = await prisma.eapTarefa.findMany({
    where: { projetoId },
    orderBy: { ordem: "asc" },
    include: {
      disciplina: { select: { id: true, disciplinaTextoLegado: true, status: true } },
      predecessoras: { select: { predecessoraId: true } },
    },
  });
  const disciplinas = await prisma.disciplina.findMany({
    where: { projetoId },
    orderBy: { ordem: "asc" },
    select: { id: true, disciplinaTextoLegado: true },
  });
  return {
    tarefas: tarefas.map((t) => ({
      id: t.id,
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
      marco: t.marco,
    })),
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
        include: {
          disciplina: { select: { id: true, disciplinaTextoLegado: true, status: true } },
          predecessoras: { select: { predecessoraId: true } },
        },
      },
    },
  });
  return projetos.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    situacao: p.situacao,
    temLinhaBase: p.eapTarefas.some((t) => t.inicioBaseline != null),
    tarefas: p.eapTarefas.map((t) => ({
      id: t.id,
      parentId: t.parentId,
      nome: t.nome,
      ordem: t.ordem,
      progresso: t.disciplina ? progressoDoStatus(t.disciplina.status) : t.progresso,
      progressoDerivado: t.disciplina != null,
      inicioPrevisto: iso(t.inicioPrevisto),
      fimPrevisto: iso(t.fimPrevisto),
      inicioBaseline: t.inicioBaseline ? iso(t.inicioBaseline) : null,
      fimBaseline: t.fimBaseline ? iso(t.fimBaseline) : null,
      disciplinaId: t.disciplinaId,
      disciplinaNome: t.disciplina?.disciplinaTextoLegado ?? null,
      predecessoraIds: t.predecessoras.map((pp) => pp.predecessoraId),
      marco: t.marco,
    })),
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
  const [sessoes, grades, feriadosDb, ferias, abonos] = await Promise.all([
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
    prisma.feriado.findMany({
      where: { data: { gte: new Date(`${inicio}T00:00:00Z`), lt: new Date(`${fimExclusivo}T00:00:00Z`) } },
      select: { data: true },
    }),
    prisma.ferias.findMany({
      where: { userId: { in: userIds }, status: "aprovado", inicio: { lt: fimVigencia }, fim: { gte: inicioVigencia } },
      select: { userId: true, inicio: true, fim: true },
    }),
    prisma.abonoFalta.findMany({
      where: { userId: { in: userIds }, status: "aprovado", dataInicio: { lt: fimVigencia }, dataFim: { gte: inicioVigencia } },
      select: { userId: true, dataInicio: true, dataFim: true },
    }),
  ]);

  const feriados = new Set(feriadosDb.map((feriado) => iso(feriado.data)));
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
 */
export async function matrizRecursos() {
  const hojeIso = diaLocal(new Date());

  const [recursos, projetos, usuariosSemRecurso, ferias, abonos, feriados] = await Promise.all([
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
  ]);

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
      const alocadoHoje = r.alocacoes.filter(ativaHoje).reduce((s, a) => s + a.percentual, 0);
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
        })),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return { linhas, projetos, usuariosSemRecurso, feriadoHoje };
}
