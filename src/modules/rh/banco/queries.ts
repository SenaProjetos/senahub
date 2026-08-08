import "server-only";
import { prisma } from "@/lib/prisma";
import { type Role } from "@/lib/roles";
import { whereAudiencia } from "@/lib/audiencias";
import { gradesEmLote } from "@/modules/rh/escalas/queries";
import { feriadosParaCalculo } from "@/modules/rh/feriados/queries";
import { CONTRATACOES_JORNADA, contextoApuracaoEmLote } from "@/modules/ponto/apuracao";
import { esperadoPorDiaMes, somarEsperadoAte } from "@/modules/ponto/esperado";
import { diaLocal, trabalhadoPorDia, type TipoBatida } from "@/modules/ponto/engine";

/**
 * Quem tem banco de horas NO MÊS pedido.
 *
 * Filtra pelo VÍNCULO que cobre o mês, não por `role` + `ativo: true`. Motivos:
 * - `role` e contratação são eixos diferentes: `administrativo` contratado como
 *   CLT tem banco de horas e ficava de fora; `clt` que virou PJ não tem e entrava.
 * - `ativo: true` remove do fechamento quem foi desligado no meio do mês — o
 *   `schema.prisma:287-289` alerta exatamente contra isso ("desativar remove a
 *   pessoa da folha do próprio mês da saída"). O vínculo com `dataFim` no mês
 *   ainda deve ser fechado, com as horas até a data de saída.
 *
 * Usuários sem NENHUM vínculo cadastrado (backfill ainda não rodado) caem no
 * critério antigo por `role`, para não sumirem do fechamento no meio da migração.
 */
export async function usuariosComJornadaNoMes(
  ano: number,
  mes: number,
): Promise<{ id: string; name: string; role: Role }[]> {
  const iniMes = new Date(Date.UTC(ano, mes - 1, 1));
  const fimMes = new Date(Date.UTC(ano, mes, 0));

  return prisma.user.findMany({
    where: {
      OR: [
        {
          vinculos: {
            some: {
              contratacao: { in: CONTRATACOES_JORNADA },
              dataInicio: { lte: fimMes },
              OR: [{ dataFim: null }, { dataFim: { gte: iniMes } }],
            },
          },
        },
        { vinculos: { none: {} }, ...whereAudiencia("clt") },
      ],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
}

/** Fechamentos de banco de horas de um mês, com nome do colaborador. */
export async function fechamentosDoMes(ano: number, mes: number) {
  const [rows, comJornada] = await Promise.all([
    prisma.bancoHorasMensal.findMany({
      where: { ano, mes },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    usuariosComJornadaNoMes(ano, mes),
  ]);
  // Fechamentos antigos podem incluir quem, pela contratação vigente no mês, não
  // tem jornada controlada (o filtro antigo era por `role`). Esconder é melhor que
  // apagar: a linha continua no banco para auditoria, mas sai do card.
  const elegiveis = new Set(comJornada.map((u) => u.id));
  return rows
    .filter((r) => elegiveis.has(r.userId))
    .map((r) => ({
      userId: r.userId,
      nome: r.user.name,
      saldoMinutos: r.saldoMinutos,
      acumuladoMinutos: r.acumuladoMinutos,
      fechadoEm: r.fechadoEm.toISOString(),
    }));
}

/** Histórico de fechamentos de um colaborador (mais recentes primeiro). */
export async function bancoHorasDe(userId: string) {
  const rows = await prisma.bancoHorasMensal.findMany({
    where: { userId },
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    take: 24,
  });
  return rows.map((r) => ({
    ano: r.ano,
    mes: r.mes,
    saldoMinutos: r.saldoMinutos,
    acumuladoMinutos: r.acumuladoMinutos,
  }));
}

/** Mês mais antigo com fechamento gravado — ponto de partida do recálculo. */
export async function primeiroMesFechado(): Promise<{ ano: number; mes: number } | null> {
  const row = await prisma.bancoHorasMensal.findFirst({
    orderBy: [{ ano: "asc" }, { mes: "asc" }],
    select: { ano: true, mes: true },
  });
  return row;
}

/**
 * Mês mais recente com fechamento gravado — base do aviso de lançamento retroativo de férias.
 *
 * APROXIMAÇÃO: `BancoHorasMensal` é por colaborador (`userId_ano_mes`) e `fecharBancoDoMes`
 * só percorre quem teve jornada no mês, então um mês fechado "para a equipe" pode não estar
 * fechado para uma pessoa específica. O máximo global superavisa, nunca subavisa — direção
 * segura para um banner que só orienta o RH a rodar o recálculo.
 */
export async function ultimoMesFechado(): Promise<{ ano: number; mes: number } | null> {
  const row = await prisma.bancoHorasMensal.findFirst({
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    select: { ano: true, mes: true },
  });
  return row;
}

/** Acumulado fechado mais recente do colaborador (até o mês informado, exclusivo). */
export async function acumuladoAte(userId: string, ano: number, mes: number) {
  const row = await prisma.bancoHorasMensal.findFirst({
    where: { userId, OR: [{ ano: { lt: ano } }, { ano, mes: { lt: mes } }] },
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    select: { ano: true, mes: true, acumuladoMinutos: true },
  });
  return row;
}

export type SaldoCorrente = {
  userId: string;
  nome: string;
  trabalhadoMinutos: number;
  esperadoMinutos: number;
  saldoMinutos: number;
};

/**
 * Saldo AO VIVO do mês (até hoje) para a equipe inteira — o que o card mostra
 * enquanto o mês não foi fechado, e o que permite conferir o mês corrente sem
 * esperar o fechamento.
 *
 * Em LOTE de propósito: chamar `espelhoMes` por usuário custaria ~12 queries
 * cada. Aqui o custo é constante (~10 queries no total) porque feriados, grades
 * e contexto de apuração são carregados uma vez para todo mundo.
 *
 * Reusa exatamente as mesmas funções puras do espelho individual
 * (`trabalhadoPorDia` + `esperadoPorDiaMes`) — não existe segunda regra de
 * cálculo aqui, só uma consulta mais barata.
 */
export async function saldoCorrenteEquipe(ano: number, mes: number): Promise<SaldoCorrente[]> {
  const usuarios = await usuariosComJornadaNoMes(ano, mes);
  if (usuarios.length === 0) return [];
  const ids = usuarios.map((u) => u.id);

  const iniLocal = new Date(ano, mes - 1, 1);
  const fimLocal = new Date(ano, mes, 1);
  const diaIni = new Date(Date.UTC(ano, mes - 1, 1));
  const diaFimExcl = new Date(Date.UTC(ano, mes, 1));

  const [batidas, sessoes, feriadosAno, grades, feriasRows, contextos] = await Promise.all([
    prisma.batida.findMany({
      where: { userId: { in: ids }, dia: { gte: diaIni, lt: diaFimExcl } },
      orderBy: { horario: "asc" },
      select: { userId: true, tipo: true, horario: true, dia: true },
    }),
    prisma.sessaoTrabalho.findMany({
      where: { userId: { in: ids }, inicio: { gte: iniLocal, lt: fimLocal } },
      orderBy: { inicio: "asc" },
      select: { userId: true, inicio: true, fim: true },
    }),
    feriadosParaCalculo(ano),
    gradesEmLote(usuarios),
    prisma.ferias.findMany({
      where: {
        userId: { in: ids },
        status: "aprovado",
        inicio: { lt: diaFimExcl },
        fim: { gte: diaIni },
      },
      select: { userId: true, inicio: true, fim: true },
    }),
    contextoApuracaoEmLote(ids, ano, mes),
  ]);

  const prefixoMes = `${ano}-${String(mes).padStart(2, "0")}-`;
  const feriadoSet = new Set(
    feriadosAno.filter((f) => f.data.startsWith(prefixoMes)).map((f) => f.data),
  );

  const batPorUser = new Map<string, Map<string, { tipo: TipoBatida; horario: Date }[]>>();
  for (const b of batidas) {
    const porDia = batPorUser.get(b.userId) ?? new Map();
    const iso = b.dia.toISOString().slice(0, 10);
    porDia.set(iso, [...(porDia.get(iso) ?? []), { tipo: b.tipo, horario: b.horario }]);
    batPorUser.set(b.userId, porDia);
  }

  const sessPorUser = new Map<string, Map<string, { inicio: Date; fim: Date | null }[]>>();
  for (const s of sessoes) {
    const porDia = sessPorUser.get(s.userId) ?? new Map();
    const iso = diaLocal(s.inicio);
    porDia.set(iso, [...(porDia.get(iso) ?? []), { inicio: s.inicio, fim: s.fim }]);
    sessPorUser.set(s.userId, porDia);
  }

  const feriasPorUser = new Map<string, Set<string>>();
  for (const f of feriasRows) {
    const set = feriasPorUser.get(f.userId) ?? new Set<string>();
    // `inicio`/`fim` são @db.Date (fim inclusivo); itera em UTC recortando ao mês.
    let cur = f.inicio < diaIni ? new Date(diaIni) : new Date(f.inicio);
    while (cur < diaFimExcl && cur <= f.fim) {
      set.add(cur.toISOString().slice(0, 10));
      cur = new Date(cur.getTime() + 86_400_000);
    }
    feriasPorUser.set(f.userId, set);
  }

  const hojeISO = diaLocal(new Date());
  const agora = new Date();
  const vazio = new Map<string, never[]>();

  return usuarios.map((u) => {
    const minutosPorDia = trabalhadoPorDia(
      batPorUser.get(u.id) ?? vazio,
      sessPorUser.get(u.id) ?? vazio,
      hojeISO,
      agora,
    );
    const trabalhado = [...minutosPorDia.values()].reduce((a, m) => a + m, 0);

    const ctx = contextos.get(u.id) ?? { controlaJornada: false, piso: null, teto: null };
    const esperado = somarEsperadoAte(
      esperadoPorDiaMes({
        ano,
        mes,
        escala: grades.get(u.id) ?? [],
        feriados: feriadoSet,
        ferias: feriasPorUser.get(u.id) ?? new Set<string>(),
        piso: ctx.piso,
        teto: ctx.teto,
        controlaJornada: ctx.controlaJornada,
      }),
      hojeISO,
    );

    return {
      userId: u.id,
      nome: u.name,
      trabalhadoMinutos: trabalhado,
      esperadoMinutos: esperado,
      saldoMinutos: trabalhado - esperado,
    };
  });
}
