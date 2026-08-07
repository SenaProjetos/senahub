import "server-only";
import { prisma } from "@/lib/prisma";
import { minutosSessao } from "@/modules/ponto/format";
import { feriadosParaCalculo } from "@/modules/rh/feriados/queries";
import { escalaRoleGrade, escalaUsuarioGrade, type DiaGrade } from "@/modules/rh/escalas/queries";
import { acumuladoAte } from "@/modules/rh/banco/queries";
import { esperadoPorDiaMes, somarEsperadoAte } from "@/modules/ponto/esperado";
import { contextoApuracao } from "@/modules/ponto/apuracao";
import {
  calcularDia,
  trabalhadoPorDia,
  diaLocal,
  diaLocalDate,
  horaLocal,
  avaliarAtraso,
  type TipoBatida,
  type EstadoJornada,
} from "@/modules/ponto/engine";

export { minutosSessao };

/** Adiciona um valor à lista da chave num Map (get-or-create). */
function pushMap<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

export type BatidaDia = {
  id: string;
  tipo: TipoBatida;
  horario: Date;
  projetoId: string | null;
  editada: boolean;
};

/**
 * Linha da timeline do dia: uma batida OU uma troca de projeto (troca não gera
 * Batida, só reabre a sessão). Em aberturas de intervalo (entrada/fim_descanso/
 * troca) vêm as métricas por projeto: minutos deste trecho, acumulado no projeto
 * até aqui e total do projeto no dia. Eventos de fechamento (descanso/saída) têm
 * `adicionadoMin: null`.
 */
export type LinhaTimeline = {
  key: string;
  kind: TipoBatida | "troca";
  horario: Date;
  editada: boolean;
  projeto: { codigo: string; nome: string } | null;
  projetoId: string | null;
  /** Minutos deste trecho (sessão aberta usa `agora`). */
  adicionadoMin: number | null;
  /** Total do projeto no DIA. */
  totalDiaProjMin: number | null;
  /** Acumulado DESDE SEMPRE do usuário nesse projeto (null p/ "sem projeto"). */
  historicoProjMin: number | null;
};

export type EstadoDia = {
  estado: EstadoJornada;
  trabalhadoMin: number;
  descansoMin: number;
  incompleto: boolean;
  /** Início da sessão aberta (para o cronômetro ao vivo) — só quando trabalhando. */
  aberturaInicio: Date | null;
  projetoAtivo: { id: string; codigo: string; nome: string } | null;
  batidas: BatidaDia[];
  /** Timeline do dia: batidas + trocas de projeto, com métricas por projeto. */
  timeline: LinhaTimeline[];
  /** Instante do cálculo no servidor — âncora do cronômetro ao vivo no cliente. */
  agora: Date;
};

/**
 * Batidas da jornada CORRENTE (a que uma nova batida afetaria): se a última
 * jornada ainda está aberta, são as do dia DELA — mesmo que tenha cruzado a
 * meia-noite; senão, as de hoje (dia novo, pode reabrir turno).
 */
async function batidasCorrentes(userId: string, agora: Date): Promise<BatidaDia[]> {
  const ultima = await prisma.batida.findFirst({
    where: { userId },
    orderBy: { horario: "desc" },
    select: { dia: true },
  });

  const selBatida = { id: true, tipo: true, horario: true, projetoId: true, editada: true } as const;

  if (ultima) {
    const doDia = (await prisma.batida.findMany({
      where: { userId, dia: ultima.dia },
      orderBy: { horario: "asc" },
      select: selBatida,
    })) as BatidaDia[];
    const est = calcularDia(doDia, agora, false).estado;
    if (est !== "fora") return doDia; // jornada aberta (mesmo cruzando a meia-noite)
  }

  return (await prisma.batida.findMany({
    where: { userId, dia: diaLocalDate(agora) },
    orderBy: { horario: "asc" },
    select: selBatida,
  })) as BatidaDia[];
}

/** Resumo enxuto da jornada corrente — miniatura do header (sem timeline nem histórico). */
export type ResumoJornada = {
  estado: EstadoJornada;
  trabalhadoMin: number;
  descansoMin: number;
  projetoAtivo: { id: string; codigo: string; nome: string } | null;
  /**
   * Projeto da última sessão da jornada corrente — usado pelo header ao voltar do
   * descanso, para reabrir no mesmo projeto sem exigir o seletor da tela cheia.
   */
  retomarProjeto: { id: string; codigo: string; nome: string } | null;
  /** Instante do cálculo no servidor — âncora do cronômetro ao vivo no cliente. */
  agora: Date;
};

/**
 * Payload da miniatura do header (`buscarResumoJornada` em `actions.ts`): ponto para quem
 * controla jornada, apontamento de horas para PJ/freelancer (ver `apontamento.ts`). Mora
 * aqui, e não no componente, para que a action e o widget compartilhem UM tipo — divergência
 * entre os dois quebra o tsc em vez de sumir silenciosamente da tela.
 */
export type ResumoHeader =
  | ({ modo: "ponto" } & ResumoJornada)
  | {
      modo: "apontamento";
      aberto: {
        inicio: Date;
        projetoId: string | null;
        projeto: { codigo: string; nome: string } | null;
      } | null;
      hojeMin: number;
      agora: Date;
    };

/**
 * Versão leve de `estadoDoDia` para o relógio do header: mesmas regras de jornada
 * corrente (incluindo a que cruza a meia-noite), sem `montarTimeline` nem os
 * acumulados por projeto — é lida em polling, precisa ser barata.
 */
export async function resumoJornada(userId: string): Promise<ResumoJornada> {
  const agora = new Date();
  const batidas = await batidasCorrentes(userId, agora);
  const calc = calcularDia(batidas, agora, true);

  // Trabalhando → sessão aberta; em descanso → última sessão fechada (para retomar no mesmo projeto).
  const sessao =
    calc.estado === "fora"
      ? null
      : await prisma.sessaoTrabalho.findFirst({
          where: { userId, ...(calc.estado === "trabalhando" ? { fim: null } : {}) },
          orderBy: { inicio: "desc" },
          select: { projeto: { select: { id: true, codigo: true, nome: true } } },
        });

  return {
    estado: calc.estado,
    trabalhadoMin: calc.trabalhadoMin,
    descansoMin: calc.descansoMin,
    projetoAtivo: calc.estado === "trabalhando" ? sessao?.projeto ?? null : null,
    retomarProjeto: sessao?.projeto ?? null,
    agora,
  };
}

/**
 * Estado da jornada CORRENTE do usuário (a que uma nova batida afetaria) — base
 * da tela de registro. Resolve jornada que cruza a meia-noite pelo dia da
 * entrada; se a última jornada está fechada, mostra a timeline do dia de hoje.
 */
export async function estadoDoDia(userId: string): Promise<EstadoDia> {
  const agora = new Date();
  const batidas = await batidasCorrentes(userId, agora);

  const calc = calcularDia(batidas, agora, true);

  const sessao =
    calc.estado === "trabalhando"
      ? await prisma.sessaoTrabalho.findFirst({
          where: { userId, fim: null },
          orderBy: { inicio: "desc" },
          include: { projeto: { select: { id: true, codigo: true, nome: true } } },
        })
      : null;

  const timeline = await montarTimeline(userId, batidas, agora);

  return {
    estado: calc.estado,
    trabalhadoMin: calc.trabalhadoMin,
    descansoMin: calc.descansoMin,
    incompleto: calc.incompleto,
    aberturaInicio: sessao?.inicio ?? null,
    projetoAtivo: sessao?.projeto ?? null,
    batidas,
    timeline,
    agora,
  };
}

/**
 * Monta a timeline do dia: batidas + trocas de projeto, com métricas por projeto.
 * Cada SessaoTrabalho = um intervalo de trabalho; seu início coincide com uma
 * batida (entrada/fim_descanso) OU com uma troca (sem batida). Anexa a cada
 * abertura: minutos do trecho (sessão aberta usa `agora`), total do projeto no
 * dia e acumulado do usuário nesse projeto desde sempre.
 */
async function montarTimeline(
  userId: string,
  batidas: BatidaDia[],
  agora: Date,
): Promise<LinhaTimeline[]> {
  if (batidas.length === 0) return [];

  const sessoes = await prisma.sessaoTrabalho.findMany({
    where: { userId, inicio: { gte: batidas[0].horario } },
    orderBy: { inicio: "asc" },
    select: { inicio: true, fim: true, projetoId: true },
  });

  const projIds = [
    ...new Set(
      [...batidas.map((b) => b.projetoId), ...sessoes.map((s) => s.projetoId)].filter(
        (x): x is string => !!x,
      ),
    ),
  ];
  const projs = projIds.length
    ? await prisma.projeto.findMany({
        where: { id: { in: projIds } },
        select: { id: true, codigo: true, nome: true },
      })
    : [];
  const projMap = new Map(projs.map((p) => [p.id, { codigo: p.codigo, nome: p.nome }]));

  const NONE = "__none";
  const chaveProj = (id: string | null) => id ?? NONE;

  // Total do projeto no DIA (sessões da jornada).
  const totalDiaProj = new Map<string, number>();
  for (const s of sessoes) {
    const m = minutosSessao(s.inicio, s.fim ?? agora);
    totalDiaProj.set(chaveProj(s.projetoId), (totalDiaProj.get(chaveProj(s.projetoId)) ?? 0) + m);
  }

  // Acumulado DESDE SEMPRE por projeto (todas as sessões do usuário nesses projetos).
  const historicoProj = new Map<string, number>();
  if (projIds.length) {
    const historico = await prisma.sessaoTrabalho.findMany({
      where: { userId, projetoId: { in: projIds } },
      select: { inicio: true, fim: true, projetoId: true },
    });
    for (const s of historico) {
      const k = chaveProj(s.projetoId);
      historicoProj.set(k, (historicoProj.get(k) ?? 0) + minutosSessao(s.inicio, s.fim ?? agora));
    }
  }

  // Métrica por instante de abertura (= início de sessão).
  const metricaPorInstante = new Map<
    number,
    { projetoId: string | null; adicionadoMin: number; totalDiaProjMin: number; historicoProjMin: number | null }
  >();
  for (const s of sessoes) {
    const m = minutosSessao(s.inicio, s.fim ?? agora);
    const k = chaveProj(s.projetoId);
    metricaPorInstante.set(s.inicio.getTime(), {
      projetoId: s.projetoId,
      adicionadoMin: m,
      totalDiaProjMin: totalDiaProj.get(k)!,
      historicoProjMin: s.projetoId ? historicoProj.get(k) ?? m : null,
    });
  }

  const instantesBatida = new Set(batidas.map((b) => b.horario.getTime()));

  const eventosBatida: LinhaTimeline[] = batidas.map((b) => {
    const met = metricaPorInstante.get(b.horario.getTime()); // só aberturas (entrada/fim_descanso)
    return {
      key: b.id,
      kind: b.tipo,
      horario: b.horario,
      editada: b.editada,
      projeto: met?.projetoId ? projMap.get(met.projetoId) ?? null : null,
      projetoId: met?.projetoId ?? null,
      adicionadoMin: met?.adicionadoMin ?? null,
      totalDiaProjMin: met?.totalDiaProjMin ?? null,
      historicoProjMin: met?.historicoProjMin ?? null,
    };
  });

  const eventosTroca: LinhaTimeline[] = sessoes
    .filter((s) => !instantesBatida.has(s.inicio.getTime()))
    .map((s, i) => {
      const met = metricaPorInstante.get(s.inicio.getTime())!;
      return {
        key: `troca-${s.inicio.getTime()}-${i}`,
        kind: "troca" as const,
        horario: s.inicio,
        editada: false,
        projeto: s.projetoId ? projMap.get(s.projetoId) ?? null : null,
        projetoId: s.projetoId,
        adicionadoMin: met.adicionadoMin,
        totalDiaProjMin: met.totalDiaProjMin,
        historicoProjMin: met.historicoProjMin,
      };
    });

  return [...eventosBatida, ...eventosTroca].sort(
    (a, b) => a.horario.getTime() - b.horario.getTime(),
  );
}

/** Sessão em andamento (cronômetro aberto) do usuário. */
export async function sessaoAberta(userId: string) {
  return prisma.sessaoTrabalho.findFirst({
    where: { userId, fim: null },
    include: { projeto: { select: { id: true, codigo: true, nome: true } } },
    orderBy: { inicio: "desc" },
  });
}

/** Projetos em que o usuário participa (para o seletor do ponto). */
export async function projetosDoUsuario(userId: string) {
  return prisma.projeto.findMany({
    where: {
      situacao: "em_andamento",
      OR: [
        { membros: { some: { userId } } },
        { disciplinas: { some: { responsaveis: { some: { userId } } } } },
      ],
    },
    select: { id: true, codigo: true, nome: true },
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
  });
}


/**
 * Dias (ISO YYYY-MM-DD) cobertos por férias APROVADAS que caem no mês.
 * Base para marcar "Férias" no espelho e para NÃO cobrar horas devidas/esperadas
 * em dias de férias (evita saldo negativo indevido no banco de horas).
 */
async function diasFeriasNoMes(userId: string, ano: number, mes: number): Promise<Set<string>> {
  const ini = new Date(Date.UTC(ano, mes - 1, 1));
  const fimExcl = new Date(Date.UTC(ano, mes, 1)); // 1º dia do mês seguinte (exclusivo)
  const rows = await prisma.ferias.findMany({
    where: { userId, status: "aprovado", inicio: { lt: fimExcl }, fim: { gte: ini } },
    select: { inicio: true, fim: true },
  });
  const set = new Set<string>();
  for (const f of rows) {
    // Itera dia a dia em UTC, recortando ao mês. `inicio`/`fim` são @db.Date (fim inclusivo).
    let cur = f.inicio < ini ? new Date(ini) : new Date(f.inicio);
    while (cur < fimExcl && cur <= f.fim) {
      set.add(cur.toISOString().slice(0, 10));
      cur = new Date(cur.getTime() + 86_400_000);
    }
  }
  return set;
}

/**
 * Espelho de ponto do mês: minutos por dia, total e saldo de banco de horas.
 *
 * HÍBRIDO: um dia que tem Batida usa o motor (fonte de verdade da jornada, trata
 * jornada incompleta corretamente); um dia só com sessão legada (pré-cutover) usa
 * a soma das sessões. Como cada sessão espelha um intervalo de trabalho das
 * batidas (invariante do rateio), os dois caminhos coincidem nos dias fechados.
 *
 * Shape de retorno CONGELADO — consumido pelo fechamento do banco de horas
 * (rh/banco/actions.ts, jobs-handlers.ts). `totalMinutos`/`saldoMinutos` para um
 * mês legado são idênticos ao cálculo anterior (agrupar por dia não muda o total);
 * a correção de fuso (`diaLocal` no lugar de `toISOString`) só reposiciona o
 * bucket de sessões noturnas. Dias de férias aprovadas passam a NÃO gerar horas
 * esperadas (não debitam o banco).
 *
 * O ESPERADO vem de `esperado.esperadoPorDiaMes` (puro, testado) sobre a janela
 * de `apuracao.contextoApuracao`. Três correções em relação ao cálculo antigo:
 * 1. Só apura dentro do vínculo (`piso`/`teto`) — antes o mês inteiro era cobrado
 *    de quem foi admitido no dia 20 ou desligado no dia 10, e meses anteriores ao
 *    próprio vínculo fechavam com a jornada cheia negativa.
 * 2. Usa o `horasDia` REAL de cada dia da semana em vez do MAIOR da grade — isto
 *    MUDA totais históricos de quem tem escala não-uniforme (era o ponto em que
 *    `espelhoMes` e `espelhoDetalhado` discordavam).
 * 3. Contratação sem jornada controlada (PJ, autônomo, pró-labore) esperado = 0.
 */
export async function espelhoMes(userId: string, ano: number, mes: number) {
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 1);
  const sessoes = await prisma.sessaoTrabalho.findMany({
    where: { userId, inicio: { gte: ini, lt: fim } },
    include: { projeto: { select: { codigo: true, nome: true } } },
    orderBy: { inicio: "asc" },
  });

  const diaIni = new Date(Date.UTC(ano, mes - 1, 1));
  const diaFim = new Date(Date.UTC(ano, mes, 1));
  const batidas = await prisma.batida.findMany({
    where: { userId, dia: { gte: diaIni, lt: diaFim } },
    orderBy: { horario: "asc" },
    select: { tipo: true, horario: true, dia: true },
  });

  const batPorDia = new Map<string, { tipo: TipoBatida; horario: Date }[]>();
  for (const b of batidas) pushMap(batPorDia, b.dia.toISOString().slice(0, 10), { tipo: b.tipo, horario: b.horario });

  const sessPorDia = new Map<string, typeof sessoes>();
  for (const s of sessoes) pushMap(sessPorDia, diaLocal(s.inicio), s);

  const hojeISO = diaLocal(new Date());
  const minutosPorDia = trabalhadoPorDia(batPorDia, sessPorDia, hojeISO, new Date());

  let totalMin = 0;
  const dias = [...minutosPorDia.keys()].map((dia) => {
    const sess = sessPorDia.get(dia) ?? [];
    const minutos = minutosPorDia.get(dia) ?? 0;
    totalMin += minutos;
    return {
      dia,
      minutos,
      sessoes: sess.map((s) => ({
        inicio: s.inicio,
        fim: s.fim,
        minutos: minutosSessao(s.inicio, s.fim),
        projeto: s.projeto ? `${s.projeto.codigo}` : null,
      })),
    };
  });

  // Esperado POR DIA — mapa completo do mês, base do filtro por período no
  // cliente E do total mensal. Regra única em `esperado.ts` (mesma que
  // `espelhoDetalhado` usa para `devidasMin`).
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const [uGrade, rGrade, ctx, feriadosAno, feriasSet] = await Promise.all([
    escalaUsuarioGrade(userId),
    escalaRoleGrade(user?.role ?? "freelancer"),
    contextoApuracao(userId, ano, mes),
    feriadosParaCalculo(ano),
    diasFeriasNoMes(userId, ano, mes),
  ]);
  const prefixoMes = `${ano}-${String(mes).padStart(2, "0")}-`;
  const feriadoSet = new Set(
    feriadosAno.filter((f) => f.data.startsWith(prefixoMes)).map((f) => f.data),
  );

  const esperadoPorDia = esperadoPorDiaMes({
    ano,
    mes,
    escala: uGrade.temOverride ? uGrade.dias : rGrade,
    feriados: feriadoSet,
    ferias: feriasSet,
    piso: ctx.piso,
    teto: ctx.teto,
    controlaJornada: ctx.controlaJornada,
  });

  // Esperado do mês SÓ até HOJE (inclusive): evita saldo negativo gigante e
  // assustador no começo do mês. Mês passado → mês inteiro; mês futuro → 0.
  const esperadoMin = somarEsperadoAte(esperadoPorDia, hojeISO);

  return {
    dias,
    totalMinutos: totalMin,
    esperadoMinutos: esperadoMin,
    saldoMinutos: totalMin - esperadoMin,
    esperadoPorDia,
    controlaJornada: ctx.controlaJornada,
  };
}

/** Rateio do mês: minutos por projeto (gestores). */
export async function rateioMes(ano: number, mes: number) {
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 1);
  const sessoes = await prisma.sessaoTrabalho.findMany({
    where: { inicio: { gte: ini, lt: fim }, projetoId: { not: null } },
    include: {
      user: { select: { name: true } },
      projeto: { select: { codigo: true, nome: true } },
    },
  });

  const mapa = new Map<string, { projeto: string; minutos: number }>();
  let totalSemProjeto = 0;
  for (const s of sessoes) {
    const m = minutosSessao(s.inicio, s.fim);
    if (!s.projeto) {
      totalSemProjeto += m;
      continue;
    }
    const k = s.projeto.codigo;
    const cur = mapa.get(k) ?? { projeto: `${s.projeto.codigo} · ${s.projeto.nome}`, minutos: 0 };
    cur.minutos += m;
    mapa.set(k, cur);
  }
  return {
    porProjeto: [...mapa.values()].sort((a, b) => b.minutos - a.minutos),
    semProjeto: totalSemProjeto,
  };
}

// ── Espelho detalhado (novo modelo de batidas) ──────────────────────────────

export type StatusDiaEspelho =
  | "ok"
  | "incompleto"
  | "falta"
  | "folga"
  | "feriado"
  | "ferias"
  | "agendado"
  | "ajustado"
  | "contestado"
  /** Fora da janela do vínculo — antes da admissão ou depois do desligamento. */
  | "fora_vinculo";

export type BatidaDetalhe = {
  id: string;
  tipo: TipoBatida;
  horario: Date;
  projeto: string | null;
  projetoId: string | null;
  geo: unknown;
  editada: boolean;
};

export type AjusteDiaInfo = {
  editorNome: string;
  justificativa: string;
  proprio: boolean;
  em: string; // ISO datetime
  antes: string; // resumo dos horários antes da edição ("04:00–12:00")
  depois: string; // resumo dos horários depois da edição
};

export type DiaEspelhoDetalhe = {
  dia: string; // ISO local YYYY-MM-DD
  diaSemana: number;
  fimDeSemana: boolean;
  feriado: string | null;
  entrada: string | null; // HH:MM local
  saida: string | null;
  descansos: { inicio: string; fim: string }[];
  temMultiplosDescansos: boolean;
  trabalhadoMin: number;
  descansoMin: number;
  devidasMin: number;
  extrasMin: number;
  atrasado: boolean;
  atrasoMin: number;
  status: StatusDiaEspelho;
  batidas: BatidaDetalhe[];
  /** TODOS os ajustes do dia (mais recente primeiro) — histórico completo de edições. */
  ajustes: AjusteDiaInfo[];
};

export type EspelhoDetalhado = {
  ano: number;
  mes: number;
  nome: string;
  dias: DiaEspelhoDetalhe[];
  totalMinutos: number;
  esperadoMinutos: number;
  saldoMinutos: number;
  acumuladoMinutos: number | null;
  aceite: { hash: string; aceitoEm: string } | null;
  podeAceitar: boolean;
  /** Só CLT/estagiário têm jornada controlada (devidas/extras/saldo/banco); demais cargos são informativos. */
  controlaJornada: boolean;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Extrai entrada, saída e pares de descanso (fechados) das batidas ordenadas do dia. */
function resumoBatidasDia(bat: { tipo: TipoBatida; horario: Date }[]): {
  entrada: Date | null;
  saida: Date | null;
  descansos: { inicio: Date; fim: Date }[];
} {
  let entrada: Date | null = null;
  let saida: Date | null = null;
  let descIni: Date | null = null;
  const descansos: { inicio: Date; fim: Date }[] = [];
  for (const b of bat) {
    if (b.tipo === "entrada" && !entrada) entrada = b.horario;
    else if (b.tipo === "saida") saida = b.horario;
    else if (b.tipo === "inicio_descanso") descIni = b.horario;
    else if (b.tipo === "fim_descanso" && descIni) {
      descansos.push({ inicio: descIni, fim: b.horario });
      descIni = null;
    }
  }
  return { entrada, saida, descansos };
}

/** Resume um snapshot de batidas (JSON do AjustePonto) em "entrada–saída (· N desc.)". */
function resumoSnapshot(snap: unknown): string {
  if (!Array.isArray(snap) || snap.length === 0) return "sem batidas";
  const bat = snap
    .filter(
      (x): x is { tipo: TipoBatida; horario: string } =>
        !!x && typeof x === "object" && "tipo" in x && "horario" in x,
    )
    .map((x) => ({ tipo: x.tipo, horario: new Date(x.horario) }));
  const r = resumoBatidasDia(bat);
  const ent = r.entrada ? horaLocal(r.entrada) : "—";
  const sai = r.saida ? horaLocal(r.saida) : "—";
  const desc = r.descansos.length > 0 ? ` · ${r.descansos.length} desc.` : "";
  return `${ent}–${sai}${desc}`;
}

/**
 * Espelho detalhado do mês (uma linha por dia do calendário) para a tela de
 * espelho: horários, descansos, devidas/extras, atraso (S3), status e geo (S6).
 * Os TOTAIS mensais (trabalhado/esperado/saldo) vêm de `espelhoMes` — mesma
 * fonte do banco de horas, para não divergir. `devidas`/`extras` por dia são
 * informativos (derivados da escala vigente).
 */
export async function espelhoDetalhado(
  userId: string,
  ano: number,
  mes: number,
): Promise<EspelhoDetalhado> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, role: true },
  });

  const [esp, uGrade, rGrade, acumulado, ctxApuracao] = await Promise.all([
    espelhoMes(userId, ano, mes),
    escalaUsuarioGrade(userId),
    escalaRoleGrade(user.role),
    acumuladoAte(userId, ano, mes),
    contextoApuracao(userId, ano, mes),
  ]);
  const gradeDe = (ds: number): DiaGrade => (uGrade.temOverride ? uGrade.dias[ds] : rGrade[ds]);

  const diaIni = new Date(Date.UTC(ano, mes - 1, 1));
  const diaFim = new Date(Date.UTC(ano, mes, 1));
  const batidas = await prisma.batida.findMany({
    where: { userId, dia: { gte: diaIni, lt: diaFim } },
    orderBy: { horario: "asc" },
    select: { id: true, tipo: true, horario: true, projetoId: true, geo: true, editada: true, dia: true },
  });
  const batPorDia = new Map<string, typeof batidas>();
  for (const b of batidas) pushMap(batPorDia, b.dia.toISOString().slice(0, 10), b);

  const projIds = [...new Set(batidas.map((b) => b.projetoId).filter((x): x is string => !!x))];
  const projs = projIds.length
    ? await prisma.projeto.findMany({ where: { id: { in: projIds } }, select: { id: true, codigo: true } })
    : [];
  const projMap = new Map(projs.map((p) => [p.id, p.codigo]));

  const ajustes = await prisma.ajustePonto.findMany({
    where: { userId, dia: { gte: diaIni, lt: diaFim } },
    orderBy: { createdAt: "asc" },
    select: {
      dia: true,
      status: true,
      justificativa: true,
      proprio: true,
      createdAt: true,
      snapshotAntes: true,
      snapshotDepois: true,
      editor: { select: { name: true } },
    },
  });
  // Mais de um ajuste no mesmo dia é possível — status do dia usa o MAIS RECENTE (createdAt asc + overwrite no Map).
  const ajustePorDia = new Map(ajustes.map((a) => [a.dia.toISOString().slice(0, 10), a.status]));
  // Histórico COMPLETO por dia: mais recente primeiro (ajustes vêm asc → unshift).
  const ajusteInfoPorDia = new Map<string, AjusteDiaInfo[]>();
  for (const a of ajustes) {
    const iso = a.dia.toISOString().slice(0, 10);
    const arr = ajusteInfoPorDia.get(iso) ?? [];
    arr.unshift({
      editorNome: a.editor.name,
      justificativa: a.justificativa,
      proprio: a.proprio,
      em: a.createdAt.toISOString(),
      antes: resumoSnapshot(a.snapshotAntes),
      depois: resumoSnapshot(a.snapshotDepois),
    });
    ajusteInfoPorDia.set(iso, arr);
  }

  const feriadosAno = await feriadosParaCalculo(ano);
  const prefixo = `${ano}-${pad2(mes)}-`;
  const feriadoPorDia = new Map(
    feriadosAno.filter((f) => f.data.startsWith(prefixo)).map((f) => [f.data, f.nome]),
  );
  const feriasSet = await diasFeriasNoMes(userId, ano, mes);

  const hojeISO = diaLocal(new Date());
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dias: DiaEspelhoDetalhe[] = [];

  for (let d = 1; d <= ultimoDia; d++) {
    const iso = `${prefixo}${pad2(d)}`;
    const ds = new Date(Date.UTC(ano, mes - 1, d)).getUTCDay();
    const feriado = feriadoPorDia.get(iso) ?? null;
    const ferias = feriasSet.has(iso);
    const grade = gradeDe(ds);
    const bat = batPorDia.get(iso) ?? [];
    const temBatidas = bat.length > 0;

    const calc = temBatidas
      ? calcularDia(bat.map((b) => ({ tipo: b.tipo, horario: b.horario })), new Date(), iso === hojeISO)
      : null;
    const resumo = resumoBatidasDia(bat);
    const trabalhadoMin = calc?.trabalhadoMin ?? 0;
    // MESMA fonte do total do mês (`espelhoMes`): férias, feriado, dia inativo na
    // grade, fora do vínculo e contratação sem jornada controlada já vêm zerados.
    const devidasMin = esp.esperadoPorDia[iso] ?? 0;
    const extrasMin = Math.max(0, trabalhadoMin - devidasMin);
    const atraso = avaliarAtraso(resumo.entrada, grade.ativo ? grade.entrada : null, grade.toleranciaMin);
    // Dia fora da janela do vínculo (antes da admissão / depois do desligamento).
    const foraVinculo =
      (!!ctxApuracao.piso && iso < ctxApuracao.piso) ||
      (!!ctxApuracao.teto && iso > ctxApuracao.teto);

    let status: StatusDiaEspelho;
    const aj = ajustePorDia.get(iso);
    if (temBatidas) {
      if (aj === "contestado") status = "contestado";
      else if (aj === "ciente" || aj === "pendente_ciencia") status = "ajustado";
      else if (calc?.incompleto) status = "incompleto";
      else status = "ok";
    } else if (ferias) status = "ferias";
    else if (feriado) status = "feriado";
    else if (foraVinculo) status = "fora_vinculo";
    else if (!grade.ativo) status = "folga";
    else if (iso > hojeISO) status = "agendado";
    // Sem jornada controlada (PJ/autônomo/pró-labore) não existe falta — o dia
    // sem batida é só um dia sem registro.
    else if (!esp.controlaJornada) status = "folga";
    else status = "falta";

    dias.push({
      dia: iso,
      diaSemana: ds,
      fimDeSemana: ds === 0 || ds === 6,
      feriado,
      entrada: resumo.entrada ? horaLocal(resumo.entrada) : null,
      saida: resumo.saida ? horaLocal(resumo.saida) : null,
      descansos: resumo.descansos.map((x) => ({ inicio: horaLocal(x.inicio), fim: horaLocal(x.fim) })),
      temMultiplosDescansos: resumo.descansos.length > 1,
      trabalhadoMin,
      descansoMin: calc?.descansoMin ?? 0,
      devidasMin,
      extrasMin,
      atrasado: atraso.atrasado,
      atrasoMin: atraso.atrasoMin,
      status,
      batidas: bat.map((b) => ({
        id: b.id,
        tipo: b.tipo,
        horario: b.horario,
        projeto: b.projetoId ? (projMap.get(b.projetoId) ?? null) : null,
        projetoId: b.projetoId,
        geo: b.geo,
        editada: b.editada,
      })),
      ajustes: ajusteInfoPorDia.get(iso) ?? [],
    });
  }

  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  const podeAceitar = ano < anoAtual || (ano === anoAtual && mes < mesAtual);

  const aceiteRow = await prisma.espelhoAceite.findUnique({
    where: { userId_ano_mes: { userId, ano, mes } },
    select: { hash: true, aceitoEm: true },
  });

  return {
    ano,
    mes,
    nome: user.name,
    dias,
    totalMinutos: esp.totalMinutos,
    esperadoMinutos: esp.esperadoMinutos,
    saldoMinutos: esp.saldoMinutos,
    acumuladoMinutos: acumulado?.acumuladoMinutos ?? null,
    aceite: aceiteRow ? { hash: aceiteRow.hash, aceitoEm: aceiteRow.aceitoEm.toISOString() } : null,
    podeAceitar,
    controlaJornada: esp.controlaJornada,
  };
}

export type EquipeAgoraItem = {
  userId: string;
  nome: string;
  estado: "trabalhando" | "descansando";
  projeto: string | null;
};

/**
 * Quem está com jornada aberta AGORA (card de gestores). "trabalhando" = sessão
 * de trabalho aberta (também cobre jornada que cruzou a meia-noite); "descansando"
 * = jornada aberta hoje em estado de descanso (sem sessão aberta).
 */
export async function equipeAgora(): Promise<EquipeAgoraItem[]> {
  const abertas = await prisma.sessaoTrabalho.findMany({
    where: { fim: null, user: { ativo: true } },
    include: { user: { select: { name: true } }, projeto: { select: { codigo: true } } },
    orderBy: { inicio: "asc" },
  });
  const itens: EquipeAgoraItem[] = [];
  const vistos = new Set<string>();
  for (const s of abertas) {
    if (vistos.has(s.userId)) continue;
    vistos.add(s.userId);
    itens.push({ userId: s.userId, nome: s.user.name, estado: "trabalhando", projeto: s.projeto?.codigo ?? null });
  }

  const hoje = diaLocalDate(new Date());
  const batidasHoje = await prisma.batida.findMany({
    where: { dia: hoje, user: { ativo: true } },
    orderBy: { horario: "asc" },
    select: { userId: true, tipo: true, horario: true },
  });
  const porUser = new Map<string, { tipo: TipoBatida; horario: Date }[]>();
  for (const b of batidasHoje) pushMap(porUser, b.userId, { tipo: b.tipo, horario: b.horario });

  const descansandoIds: string[] = [];
  for (const [uid, bat] of porUser) {
    if (vistos.has(uid)) continue;
    if (calcularDia(bat, new Date(), true).estado === "descansando") descansandoIds.push(uid);
  }
  if (descansandoIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: descansandoIds } },
      select: { id: true, name: true },
    });
    const nomePorId = new Map(users.map((u) => [u.id, u.name]));
    for (const uid of descansandoIds) {
      itens.push({ userId: uid, nome: nomePorId.get(uid) ?? "—", estado: "descansando", projeto: null });
    }
  }

  return itens.sort((a, b) => a.nome.localeCompare(b.nome));
}

export type AjustePendente = {
  id: string;
  dia: string;
  editorNome: string;
  justificativa: string;
  criadoEm: string;
};

/** Ajustes feitos por terceiros no ponto do usuário, aguardando sua ciência. */
export async function ajustesPendentesCiencia(userId: string): Promise<AjustePendente[]> {
  const rows = await prisma.ajustePonto.findMany({
    where: { userId, status: "pendente_ciencia" },
    orderBy: { createdAt: "desc" },
    include: { editor: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    dia: r.dia.toISOString().slice(0, 10),
    editorNome: r.editor.name,
    justificativa: r.justificativa,
    criadoEm: r.createdAt.toISOString(),
  }));
}
