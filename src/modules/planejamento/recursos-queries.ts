import "server-only";

import { prisma } from "@/lib/prisma";
import type { Dia } from "@/lib/calendario-trabalho";
import { diaLocal } from "@/modules/ponto/engine";
import { gradesEmLote } from "@/modules/rh/escalas/queries";
import { chaveSemanaIso } from "./disponibilidade";
import { montarCalendarioComNomes, planoDoProjeto } from "./agenda";
import {
  capacidadePorSemana,
  detectarSobrecargas,
  diasEntre,
  parcelasDaAlocacaoDigitada,
  parcelasDasLinhas,
  parcelasDePerfis,
  ROTULO_PAPEL,
  type LinhaCarga,
  type Papel,
  type ParcelaCarga,
  type PessoaCapacidade,
  type Sobrecarga,
} from "./recursos";
import { sugerirCorrecoes, type ContextoProjeto, type Sugestoes } from "./sugestoes-recursos";

/**
 * Carga da equipe (F5 — D17, D18, D8): quanto cada pessoa tem de trabalho por semana,
 * contra quanto ela tem de capacidade, com as sobrecargas e o que fazer com elas.
 *
 * Os dois mundos da transição, sem contar a mesma hora duas vezes (D17):
 *   - projeto com cronograma APROVADO → horas das atribuições das linhas, nas datas que o
 *     motor calcula AGORA (a qualidade faz o mesmo: o banco pode estar desatualizado);
 *   - projeto SEM cronograma aprovado → alocação digitada ("50% no Bela Vista") convertida
 *     em hora. A alocação digitada de projeto aprovado é IGNORADA.
 *
 * Capacidade e horas usam o MESMO calendário (`montarCalendarioComNomes`).
 */

export type PessoaCarga = {
  userId: string;
  nome: string;
  image: string | null;
  /** Horas disponíveis por semana, já sem férias, abono e feriado. */
  capacidade: Record<string, number>;
  /**
   * Horas da semana ÚTIL da pessoa: com feriado, SEM descontar férias e abono. É a base do
   * percentual da matriz — a mesma régua do "50% no projeto" digitado, que não encolhe
   * quando a pessoa sai de férias (quem acusa as férias é a capacidade efetiva).
   */
  semanaUtil: Record<string, number>;
  /** Horas planejadas por semana, todos os projetos. */
  carga: Record<string, number>;
  /** Horas por projeto por semana — o detalhe que a matriz mostra. */
  porProjeto: Record<string, Record<string, number>>;
};

/**
 * `sugestoes` vem VAZIA na listagem e só é preenchida quando alguém pede (`sugestaoDe`): cada
 * sugestão roda o motor de novo e recalcula a carga de todo mundo. Medido com 160 linhas,
 * 8 pessoas e 10 sobrecargas: 1,3 s com sugestões contra 53 ms sem — e a página é aberta por
 * qualquer um com `recursos:ver`. Sob demanda, o custo cai em quem clica.
 */
export type SobrecargaComSugestao = Sobrecarga & { sugestoes: Sugestoes };

export type DemandaPerfil = {
  papel: Papel;
  rotuloPapel: string;
  /** Nome da disciplina (catálogo) — "Projetista" + "Elétrica" = o perfil. */
  disciplina: string | null;
  porSemana: Record<string, number>;
};

/**
 * Nomes para a tela: as sugestões e sobrecargas carregam IDS (linha, projeto), e "atrasar a
 * linha cmx3k9…" não diz nada a ninguém. Resolvidos AQUI, uma vez — a tela não busca nome.
 */
export type RotulosCarga = {
  linhas: Record<string, { nome: string; projetoId: string }>;
  projetos: Record<string, { codigo: string; nome: string }>;
};

export type CargaDaEquipe = {
  semanas: string[];
  rotulos: RotulosCarga;
  /** Projetos cuja carga vem das linhas. Os demais vêm da alocação digitada. */
  projetosCalculados: string[];
  pessoas: PessoaCarga[];
  sobrecargas: SobrecargaComSugestao[];
  demandaPerfis: DemandaPerfil[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

function somarDias(dia: Dia, n: number): Dia {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

function segundaDaSemana(dia: Dia): Dia {
  const dow = new Date(`${dia}T00:00:00Z`).getUTCDay();
  return somarDias(dia, -((dow + 6) % 7));
}

export async function cargaDaEquipe(
  opcoes: { semanas?: number; hoje?: Dia; sugestaoDe?: { userId: string; semana: string } } = {},
): Promise<CargaDaEquipe> {
  const nSemanas = opcoes.semanas ?? 12;
  const inicio = segundaDaSemana(opcoes.hoje ?? diaLocal(new Date()));
  const fim = somarDias(inicio, nSemanas * 7 - 1);
  const dias = diasEntre(inicio, fim);
  const semanas = [...new Set(dias.map(chaveSemanaIso))];

  const aprovados = (
    await prisma.cronogramaProjeto.findMany({ where: { aprovado: true }, select: { projetoId: true } })
  ).map((c) => c.projetoId);

  // ── Linhas dos projetos aprovados, nas datas do motor ───────────────────
  const [linhasDb, planos] = await Promise.all([
    prisma.eapTarefa.findMany({
      where: { projetoId: { in: aprovados } },
      select: {
        id: true,
        projetoId: true,
        tipoEap: true,
        status: true,
        duracaoDias: true,
        nome: true,
        inicioReal: true,
        disciplinaId: true,
        disciplina: { select: { disciplinaId: true, catalogo: { select: { nome: true } } } },
        atribuicoes: { select: { id: true, userId: true, papel: true, horasPrevistas: true } },
      },
    }),
    Promise.all(aprovados.map(async (id) => [id, await planoDoProjeto(id)] as const)),
  ]);
  const planoPorProjeto = new Map(planos);

  const linhasCarga: LinhaCarga[] = [];
  for (const l of linhasDb) {
    if (l.atribuicoes.length === 0) continue;
    const agendada = planoPorProjeto.get(l.projetoId)?.resultado.linhas.get(l.id);
    if (!agendada) continue;
    linhasCarga.push({
      id: l.id,
      projetoId: l.projetoId,
      tipoEap: l.tipoEap,
      ehResumo: agendada.ehResumo,
      duracaoDias: Number(l.duracaoDias),
      status: l.status,
      inicio: agendada.inicio,
      fim: agendada.fim,
      atribuicoes: l.atribuicoes.map((a) => ({ id: a.id, userId: a.userId, papel: a.papel, horas: Number(a.horasPrevistas) })),
    });
  }

  // ── Pessoas: recursos ativos + quem está em linha aprovada ─────────────
  const idsNasLinhas = new Set(linhasCarga.flatMap((l) => l.atribuicoes.map((a) => a.userId)).filter((u): u is string => u != null));
  const [recursos, alocacoes] = await Promise.all([
    prisma.recurso.findMany({ where: { ativo: true }, select: { userId: true, capacidade: true } }),
    prisma.alocacao.findMany({
      where: {
        projetoId: { notIn: aprovados },
        recurso: { ativo: true },
        AND: [
          { OR: [{ inicio: null }, { inicio: { lte: new Date(`${fim}T00:00:00Z`) } }] },
          { OR: [{ fim: null }, { fim: { gte: new Date(`${inicio}T00:00:00Z`) } }] },
        ],
      },
      select: { projetoId: true, percentual: true, inicio: true, fim: true, recurso: { select: { userId: true } } },
    }),
  ]);
  const multiplicador = new Map(recursos.map((r) => [r.userId, Number(r.capacidade)]));
  const userIds = [...new Set([...recursos.map((r) => r.userId), ...idsNasLinhas])];

  const [usuarios, ferias, abonos, calendario] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, image: true, contratacao: true },
      orderBy: { name: "asc" },
    }),
    prisma.ferias.findMany({
      where: { userId: { in: userIds }, status: "aprovado", inicio: { lte: new Date(`${fim}T00:00:00Z`) }, fim: { gte: new Date(`${inicio}T00:00:00Z`) } },
      select: { userId: true, inicio: true, fim: true },
    }),
    prisma.abonoFalta.findMany({
      where: { userId: { in: userIds }, status: "aprovado", dataInicio: { lte: new Date(`${fim}T00:00:00Z`) }, dataFim: { gte: new Date(`${inicio}T00:00:00Z`) } },
      select: { userId: true, dataInicio: true, dataFim: true },
    }),
    montarCalendarioComNomes([Number(inicio.slice(0, 4)), Number(fim.slice(0, 4))]),
  ]);
  const cal = calendario.calendario;
  const grades = await gradesEmLote(usuarios.map((u) => ({ id: u.id, contratacao: u.contratacao })));

  // Ausências por dia e o MOTIVO por semana (D8: férias e jornada são aviso, nunca mexem em data).
  const ausencias = new Map<string, Set<Dia>>();
  const motivos = new Map<string, Map<string, string[]>>();
  const anotar = (userId: string, dia: Dia, motivo: string) => {
    if (dia < inicio || dia > fim) return;
    ausencias.set(userId, (ausencias.get(userId) ?? new Set()).add(dia));
    const porSemana = motivos.get(userId) ?? new Map<string, string[]>();
    const s = chaveSemanaIso(dia);
    const lista = porSemana.get(s) ?? [];
    if (!lista.includes(motivo)) lista.push(motivo);
    porSemana.set(s, lista);
    motivos.set(userId, porSemana);
  };
  for (const f of ferias) for (const d of diasEntre(iso(f.inicio), iso(f.fim))) anotar(f.userId, d, "férias");
  for (const a of abonos) for (const d of diasEntre(iso(a.dataInicio), iso(a.dataFim))) anotar(a.userId, d, "abono");

  const pessoas: PessoaCapacidade[] = usuarios.map((u) => ({
    userId: u.id,
    multiplicador: multiplicador.get(u.id) ?? 1,
    grade: grades.get(u.id) ?? [],
    ausencias: ausencias.get(u.id) ?? new Set(),
  }));
  const capacidade = new Map(pessoas.map((p) => [p.userId, capacidadePorSemana(dias, p, cal)]));

  // Feriado entra no motivo de quem teria trabalhado naquele dia.
  for (const [dia, nome] of calendario.nomes) {
    if (dia < inicio || dia > fim) continue;
    for (const p of pessoas) {
      const dow = new Date(`${dia}T00:00:00Z`).getUTCDay();
      if (p.grade.some((g) => g.diaSemana === dow && g.ativo)) {
        const porSemana = motivos.get(p.userId) ?? new Map<string, string[]>();
        const s = chaveSemanaIso(dia);
        porSemana.set(s, [...(porSemana.get(s) ?? []), `feriado (${nome})`]);
        motivos.set(p.userId, porSemana);
      }
    }
  }

  // ── Carga: linhas aprovadas + alocação digitada dos demais ──────────────
  const porPessoa = new Map(pessoas.map((p) => [p.userId, p]));
  const parcelas: ParcelaCarga[] = [
    ...parcelasDasLinhas(linhasCarga, cal),
    ...alocacoes.flatMap((a) => {
      const p = porPessoa.get(a.recurso.userId);
      if (!p) return [];
      return parcelasDaAlocacaoDigitada(
        { projetoId: a.projetoId, percentual: a.percentual, inicio: a.inicio ? iso(a.inicio) : null, fim: a.fim ? iso(a.fim) : null },
        p,
        dias,
        cal,
      );
    }),
  ];

  // ── Sobrecargas e sugestões ─────────────────────────────────────────────
  const sobrecargas = detectarSobrecargas(parcelas, capacidade, { semanas, motivosReducao: motivos });

  const contextos = new Map<string, ContextoProjeto>();
  for (const projetoId of aprovados) {
    const plano = planoPorProjeto.get(projetoId);
    if (!plano) continue;
    contextos.set(projetoId, {
      projetoId,
      linhasMotor: plano.entrada,
      inicioProjeto: plano.inicioProjeto,
      dataStatus: plano.dataStatus,
      fimProjeto: plano.resultado.fimProjeto,
      agendado: plano.resultado.linhas,
      linhasCarga: linhasCarga.filter((l) => l.projetoId === projetoId),
      iniciadas: new Set(linhasDb.filter((l) => l.projetoId === projetoId && l.inicioReal).map((l) => l.id)),
    });
  }

  const alvo = opcoes.sugestaoDe;
  const pedida = alvo ? sobrecargas.find((s) => s.userId === alvo.userId && s.semana === alvo.semana) : undefined;
  const qualificados = pedida ? await montarQualificados(linhasDb, porPessoa) : () => [];
  const comSugestao: SobrecargaComSugestao[] = sobrecargas.map((s) => ({
    ...s,
    sugestoes:
      s === pedida
        ? sugerirCorrecoes(s, { projetos: contextos, parcelas, capacidade, semanas, cal, qualificados })
        : { atrasar: null, passar: null },
  }));

  // ── Saída ───────────────────────────────────────────────────────────────
  const redondo = (h: number) => Math.round(h * 10) / 10;
  const saida: PessoaCarga[] = usuarios.map((u) => {
    const carga: Record<string, number> = {};
    const porProjeto: Record<string, Record<string, number>> = {};
    for (const pc of parcelas) {
      if (pc.userId !== u.id || !semanas.includes(pc.semana)) continue;
      carga[pc.semana] = (carga[pc.semana] ?? 0) + pc.horas;
      porProjeto[pc.projetoId] ??= {};
      porProjeto[pc.projetoId][pc.semana] = (porProjeto[pc.projetoId][pc.semana] ?? 0) + pc.horas;
    }
    const cap = capacidade.get(u.id) ?? new Map();
    const p = porPessoa.get(u.id);
    const util = p ? capacidadePorSemana(dias, { ...p, ausencias: new Set() }, cal) : new Map<string, number>();
    return {
      userId: u.id,
      nome: u.name,
      image: u.image,
      capacidade: Object.fromEntries(semanas.map((s) => [s, redondo(cap.get(s) ?? 0)])),
      semanaUtil: Object.fromEntries(semanas.map((s) => [s, redondo(util.get(s) ?? 0)])),
      carga: Object.fromEntries(semanas.map((s) => [s, redondo(carga[s] ?? 0)])),
      porProjeto: Object.fromEntries(
        Object.entries(porProjeto).map(([p, m]) => [p, Object.fromEntries(Object.entries(m).map(([s, h]) => [s, redondo(h)]))]),
      ),
    };
  });

  // Demanda dos perfis por papel × disciplina do catálogo.
  const disciplinaDaLinha = new Map(linhasDb.map((l) => [l.id, l.disciplina?.catalogo?.nome ?? null]));
  const demanda = new Map<string, DemandaPerfil>();
  for (const pp of parcelasDePerfis(linhasCarga, cal)) {
    if (!semanas.includes(pp.semana)) continue;
    const disciplina = disciplinaDaLinha.get(pp.linhaId) ?? null;
    const k = `${pp.papel}|${disciplina ?? ""}`;
    const d = demanda.get(k) ?? { papel: pp.papel, rotuloPapel: ROTULO_PAPEL[pp.papel], disciplina, porSemana: {} };
    d.porSemana[pp.semana] = redondo((d.porSemana[pp.semana] ?? 0) + pp.horas);
    demanda.set(k, d);
  }

  // Rótulos: linhas de projeto aprovado + todo projeto que aparece na carga.
  const idsProjetos = [...new Set([...aprovados, ...parcelas.map((p) => p.projetoId)])];
  const projetosDb = await prisma.projeto.findMany({
    where: { id: { in: idsProjetos } },
    select: { id: true, codigo: true, nome: true },
  });
  const rotulos: RotulosCarga = {
    linhas: Object.fromEntries(linhasDb.map((l) => [l.id, { nome: l.nome, projetoId: l.projetoId }])),
    projetos: Object.fromEntries(projetosDb.map((p) => [p.id, { codigo: p.codigo, nome: p.nome }])),
  };

  return {
    semanas,
    rotulos,
    projetosCalculados: aprovados,
    pessoas: saida,
    sobrecargas: comSugestao,
    demandaPerfis: [...demanda.values()],
  };
}

/**
 * Quem pode receber uma atribuição na sugestão "passar para" (D18): responsável da mesma
 * disciplina do projeto, ou quem já exerce o MESMO papel numa linha da mesma disciplina de
 * catálogo em qualquer projeto. Sem esse filtro a sugestão mandaria o projeto elétrico para
 * quem só faz hidráulica — a carga sozinha não sabe distinguir.
 *
 * Só entra quem tem capacidade conhecida (está em Recursos ou já trabalha em cronograma
 * aprovado): sem capacidade não há como garantir que a pessoa aguenta.
 */
async function montarQualificados(
  linhas: readonly { id: string; disciplinaId: string | null; disciplina: { disciplinaId: string | null } | null }[],
  pessoasConhecidas: ReadonlyMap<string, unknown>,
): Promise<(linhaId: string, papel: Papel) => readonly string[]> {
  const disciplinaIds = [...new Set(linhas.map((l) => l.disciplinaId).filter((d): d is string => d != null))];
  const catalogoIds = [...new Set(linhas.map((l) => l.disciplina?.disciplinaId).filter((d): d is string => d != null))];
  const [responsaveis, experiencia] = await Promise.all([
    prisma.disciplinaResponsavel.findMany({
      where: { disciplinaId: { in: disciplinaIds }, user: { ativo: true } },
      select: { disciplinaId: true, userId: true },
    }),
    prisma.eapAtribuicao.findMany({
      where: { userId: { not: null }, user: { ativo: true }, tarefa: { disciplina: { disciplinaId: { in: catalogoIds } } } },
      select: { userId: true, papel: true, tarefa: { select: { disciplina: { select: { disciplinaId: true } } } } },
    }),
  ]);
  const respPorDisciplina = new Map<string, Set<string>>();
  for (const r of responsaveis) respPorDisciplina.set(r.disciplinaId, (respPorDisciplina.get(r.disciplinaId) ?? new Set()).add(r.userId));
  const porCatalogoPapel = new Map<string, Set<string>>();
  for (const e of experiencia) {
    const cat = e.tarefa.disciplina?.disciplinaId;
    if (!cat || !e.userId) continue;
    const k = `${cat}|${e.papel}`;
    porCatalogoPapel.set(k, (porCatalogoPapel.get(k) ?? new Set()).add(e.userId));
  }
  const linhaPorId = new Map(linhas.map((l) => [l.id, l]));
  return (linhaId, papel) => {
    const l = linhaPorId.get(linhaId);
    if (!l) return [];
    const out = new Set<string>([
      ...(l.disciplinaId ? (respPorDisciplina.get(l.disciplinaId) ?? []) : []),
      ...(l.disciplina?.disciplinaId ? (porCatalogoPapel.get(`${l.disciplina.disciplinaId}|${papel}`) ?? []) : []),
    ]);
    return [...out].filter((u) => pessoasConhecidas.has(u));
  };
}
