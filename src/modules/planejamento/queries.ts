import "server-only";
import { prisma } from "@/lib/prisma";
import { GLOBAL_ROLES, type Role } from "@/lib/roles";
import { escopoProjeto } from "@/modules/projetos/queries";
import { progressoDoStatus } from "@/modules/projetos/status";
import { minutosSessao } from "@/modules/ponto/format";

type Viewer = { id: string; role: Role };

function isGlobal(role: Role) {
  return role === "admin" || GLOBAL_ROLES.includes(role);
}

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
  if (isGlobal(viewer.role)) {
    return prisma.projeto.findUnique({ where: { id: projetoId }, select: { id: true, codigo: true, nome: true } });
  }
  return prisma.projeto.findFirst({
    where: { AND: [{ id: projetoId }, escopoProjeto(viewer)] },
    select: { id: true, codigo: true, nome: true },
  });
}

/** EAP completa de um projeto (lista plana ordenada por hierarquia; árvore montada no client). */
export async function eapDoProjeto(projetoId: string) {
  const tarefas = await prisma.eapTarefa.findMany({
    where: { projetoId },
    orderBy: { ordem: "asc" },
    include: {
      disciplina: { select: { id: true, nome: true, status: true } },
      predecessoras: { select: { predecessoraId: true } },
    },
  });
  const disciplinas = await prisma.disciplina.findMany({
    where: { projetoId },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true },
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
      disciplinaNome: t.disciplina?.nome ?? null,
      predecessoraIds: t.predecessoras.map((p) => p.predecessoraId),
      marco: t.marco,
    })),
    disciplinas,
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
          disciplina: { select: { id: true, nome: true, status: true } },
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
      disciplinaNome: t.disciplina?.nome ?? null,
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
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 1);

  const [alocacoes, sessoes] = await Promise.all([
    prisma.alocacao.findMany({
      where: {
        projetoId,
        AND: [{ OR: [{ inicio: null }, { inicio: { lt: fim } }] }, { OR: [{ fim: null }, { fim: { gte: ini } }] }],
      },
      include: { recurso: { include: { user: { select: { id: true, name: true } } } } },
    }),
    prisma.sessaoTrabalho.findMany({
      where: { projetoId, inicio: { gte: ini, lt: fim } },
      select: { userId: true, inicio: true, fim: true },
    }),
  ]);

  const horasPorUser = new Map<string, number>();
  for (const s of sessoes) {
    horasPorUser.set(s.userId, (horasPorUser.get(s.userId) ?? 0) + minutosSessao(s.inicio, s.fim));
  }

  const linhas = alocacoes.map((a) => ({
    userId: a.recurso.user.id,
    nome: a.recurso.user.name,
    percentual: a.percentual,
    horasReais: Math.round(((horasPorUser.get(a.recurso.user.id) ?? 0) / 60) * 10) / 10,
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
  const hoje = new Date();
  const ini = new Date(hoje);
  ini.setDate(hoje.getDate() - semanas * 7);

  const sessoes = await prisma.sessaoTrabalho.findMany({
    where: { inicio: { gte: ini }, fim: { not: null } },
    select: { userId: true, inicio: true, fim: true },
    orderBy: { inicio: "asc" },
  });

  if (sessoes.length === 0) return { semanas: [] as string[], linhas: [] as { userId: string; nome: string; porSemana: Record<string, number> }[] };

  const minutosPorUserSemana = new Map<string, Map<string, number>>();
  const isoWeek = (d: Date): string => {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const jan4 = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
    const startOfWeek1 = new Date(jan4);
    startOfWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
    const weekNum = Math.ceil(((tmp.getTime() - startOfWeek1.getTime()) / 86_400_000 + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
  };

  const semanasSet = new Set<string>();
  for (const s of sessoes) {
    const mins = minutosSessao(s.inicio, s.fim);
    if (mins <= 0) continue;
    const wk = isoWeek(s.inicio);
    semanasSet.add(wk);
    if (!minutosPorUserSemana.has(s.userId)) minutosPorUserSemana.set(s.userId, new Map());
    const m = minutosPorUserSemana.get(s.userId)!;
    m.set(wk, (m.get(wk) ?? 0) + mins);
  }

  const semanasOrdenadas = [...semanasSet].sort();
  const userIds = [...minutosPorUserSemana.keys()];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const nome = new Map(users.map((u) => [u.id, u.name]));

  const linhas = userIds.map((uid) => {
    const porSemana: Record<string, number> = {};
    const mapa = minutosPorUserSemana.get(uid)!;
    for (const wk of semanasOrdenadas) {
      const mins = mapa.get(wk) ?? 0;
      porSemana[wk] = Math.round((mins / 60) * 10) / 10;
    }
    return { userId: uid, nome: nome.get(uid) ?? "—", porSemana };
  }).sort((a, b) => a.nome.localeCompare(b.nome));

  return { semanas: semanasOrdenadas, linhas };
}

/**
 * Matriz de recursos: pessoas (recursos) × projetos.
 * P-29: superalocação considera só as alocações ATIVAS hoje (respeita inicio/fim).
 * P-30: capacidade efetiva desconta ausências de hoje (férias/abono aprovados, feriado).
 */
export async function matrizRecursos() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [recursos, projetos, usuariosSemRecurso, ferias, abonos, feriado] = await Promise.all([
    prisma.recurso.findMany({
      where: { ativo: true },
      include: {
        user: { select: { id: true, name: true, role: true } },
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
      where: { ativo: true, role: { notIn: ["cliente", "freelancer"] }, recurso: null },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.ferias.findMany({
      where: { status: "aprovado", inicio: { lte: hoje }, fim: { gte: hoje } },
      select: { userId: true },
    }),
    prisma.abonoFalta.findMany({
      where: { status: "aprovado", dataInicio: { lte: hoje }, dataFim: { gte: hoje } },
      select: { userId: true },
    }),
    prisma.feriado.findFirst({ where: { data: hoje }, select: { nome: true } }),
  ]);

  // Motivo de ausência de hoje por usuário (feriado afeta todos).
  const ausenciaPorUser = new Map<string, string>();
  for (const f of ferias) ausenciaPorUser.set(f.userId, "férias");
  for (const a of abonos) if (!ausenciaPorUser.has(a.userId)) ausenciaPorUser.set(a.userId, "abono");
  const feriadoHoje = feriado?.nome ?? null;

  const ativaHoje = (a: { inicio: Date | null; fim: Date | null }) =>
    (!a.inicio || a.inicio <= hoje) && (!a.fim || a.fim >= hoje);

  const linhas = recursos
    .map((r) => {
      const capacidadePct = Math.round(Number(r.capacidade) * 100);
      const total = r.alocacoes.reduce((s, a) => s + a.percentual, 0);
      const alocadoHoje = r.alocacoes.filter(ativaHoje).reduce((s, a) => s + a.percentual, 0);
      const motivoAusencia = feriadoHoje ? `feriado (${feriadoHoje})` : (ausenciaPorUser.get(r.user.id) ?? null);
      const ausente = motivoAusencia != null;
      const capacidadeEfetivaPct = ausente ? 0 : capacidadePct;
      return {
        recursoId: r.id,
        userId: r.user.id,
        nome: r.user.name,
        role: r.user.role,
        capacidade: Number(r.capacidade),
        capacidadePct,
        capacidadeEfetivaPct,
        ausente,
        motivoAusencia,
        cor: r.cor,
        custoHora: r.custoHora != null ? Number(r.custoHora) : null,
        totalAlocado: total,
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
