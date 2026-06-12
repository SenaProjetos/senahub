import "server-only";
import { prisma } from "@/lib/prisma";
import { minutosSessao } from "@/modules/ponto/format";

export { minutosSessao };

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

function diasUteis(ano: number, mes: number): number {
  let n = 0;
  const dias = new Date(ano, mes, 0).getDate();
  for (let d = 1; d <= dias; d++) {
    const wd = new Date(ano, mes - 1, d).getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/** Espelho de ponto do mês: sessões por dia, total e saldo de banco de horas. */
export async function espelhoMes(userId: string, ano: number, mes: number) {
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 1);
  const sessoes = await prisma.sessaoTrabalho.findMany({
    where: { userId, inicio: { gte: ini, lt: fim } },
    include: { projeto: { select: { codigo: true, nome: true } } },
    orderBy: { inicio: "asc" },
  });

  const porDia = new Map<string, { minutos: number; sessoes: typeof sessoes }>();
  let totalMin = 0;
  for (const s of sessoes) {
    const dia = s.inicio.toISOString().slice(0, 10);
    const m = minutosSessao(s.inicio, s.fim);
    totalMin += m;
    const cur = porDia.get(dia) ?? { minutos: 0, sessoes: [] };
    cur.minutos += m;
    cur.sessoes.push(s);
    porDia.set(dia, cur);
  }

  const escala = await prisma.escalaTrabalho.findUnique({ where: { userId } });
  const horasDia = escala ? Number(escala.horasDia) : 8;
  const esperadoMin = horasDia * 60 * diasUteis(ano, mes);

  return {
    dias: [...porDia.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, v]) => ({
        dia,
        minutos: v.minutos,
        sessoes: v.sessoes.map((s) => ({
          inicio: s.inicio,
          fim: s.fim,
          minutos: minutosSessao(s.inicio, s.fim),
          projeto: s.projeto ? `${s.projeto.codigo}` : null,
        })),
      })),
    totalMinutos: totalMin,
    esperadoMinutos: esperadoMin,
    saldoMinutos: totalMin - esperadoMin,
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
