import "server-only";
import { prisma } from "@/lib/prisma";
import { minutosSessao } from "@/modules/ponto/format";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { horasDiaPadraoEmLote } from "@/modules/rh/escalas/queries";

function diasUteis(ano: number, mes: number): number {
  let n = 0;
  const dias = new Date(ano, mes, 0).getDate();
  for (let d = 1; d <= dias; d++) {
    const wd = new Date(ano, mes - 1, d).getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/**
 * Custo/hora por usuário no mês:
 * 1) `Recurso.custoHora` quando definido; senão
 * 2) `User.salarioBase` ÷ horas-mês (escala.horasDia × dias úteis); senão 0.
 */
async function custoHoraPorUsuario(
  userIds: string[],
  ano: number,
  mes: number,
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const [recursos, users] = await Promise.all([
    prisma.recurso.findMany({ where: { userId: { in: userIds } }, select: { userId: true, custoHora: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, role: true, salarioBase: true } }),
  ]);
  const rec = new Map(recursos.map((r) => [r.userId, r.custoHora != null ? Number(r.custoHora) : null]));
  const sal = new Map(users.map((u) => [u.id, u.salarioBase != null ? Number(u.salarioBase) : null]));
  const esc = await horasDiaPadraoEmLote(users.map((u) => ({ id: u.id, role: u.role ?? "freelancer" })));
  const horasMes = diasUteis(ano, mes); // dias úteis; × horasDia abaixo

  const out = new Map<string, number>();
  for (const uid of userIds) {
    const r = rec.get(uid);
    if (r != null && r > 0) {
      out.set(uid, r);
      continue;
    }
    const s = sal.get(uid);
    if (s != null && s > 0) {
      const h = (esc.get(uid) ?? 8) * horasMes;
      out.set(uid, h > 0 ? s / h : 0);
    } else {
      out.set(uid, 0);
    }
  }
  return out;
}

export type RateioRow = {
  userId: string;
  projetoId: string;
  minutos: number;
  custoHora: number;
  custo: number;
};

/** Linhas detalhadas user×projeto do mês (cálculo ao vivo, base do fechamento). */
export async function calcularRateioDetalhado(ano: number, mes: number): Promise<RateioRow[]> {
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 1);
  const sessoes = await prisma.sessaoTrabalho.findMany({
    where: { inicio: { gte: ini, lt: fim }, projetoId: { not: null } },
    select: { userId: true, projetoId: true, inicio: true, fim: true },
  });
  const userIds = [...new Set(sessoes.map((s) => s.userId))];
  const custoH = await custoHoraPorUsuario(userIds, ano, mes);

  const mapa = new Map<string, RateioRow>();
  for (const s of sessoes) {
    if (!s.projetoId) continue;
    const m = minutosSessao(s.inicio, s.fim);
    const ch = custoH.get(s.userId) ?? 0;
    const k = `${s.userId}|${s.projetoId}`;
    const cur = mapa.get(k) ?? { userId: s.userId, projetoId: s.projetoId, minutos: 0, custoHora: ch, custo: 0 };
    cur.minutos += m;
    cur.custo += (m / 60) * ch;
    mapa.set(k, cur);
  }
  return [...mapa.values()];
}

/** Rateio do mês agregado por projeto, para o painel do gestor. */
export async function rateioMesGestor(ano: number, mes: number) {
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 1);
  const [rows, fechadas, semProj] = await Promise.all([
    calcularRateioDetalhado(ano, mes),
    prisma.rateioHora.findMany({ where: { ano, mes }, select: { fechadoEm: true }, take: 1, orderBy: { fechadoEm: "desc" } }),
    prisma.sessaoTrabalho.findMany({
      where: { inicio: { gte: ini, lt: fim }, projetoId: null },
      select: { inicio: true, fim: true },
    }),
  ]);

  const projIds = [...new Set(rows.map((r) => r.projetoId))];
  const projetos = await prisma.projeto.findMany({
    where: { id: { in: projIds } },
    select: { id: true, codigo: true, nome: true },
  });
  const pinfo = new Map(projetos.map((p) => [p.id, p]));

  const agg = new Map<string, { projeto: string; minutos: number; custo: number }>();
  let custoTotal = 0;
  for (const r of rows) {
    const p = pinfo.get(r.projetoId);
    const label = p ? `${formatarCodigo(p.codigo)} · ${p.nome}` : r.projetoId;
    const cur = agg.get(r.projetoId) ?? { projeto: label, minutos: 0, custo: 0 };
    cur.minutos += r.minutos;
    cur.custo += r.custo;
    custoTotal += r.custo;
    agg.set(r.projetoId, cur);
  }

  const semProjeto = semProj.reduce((acc, s) => acc + minutosSessao(s.inicio, s.fim), 0);

  return {
    porProjeto: [...agg.values()].sort((a, b) => b.minutos - a.minutos),
    semProjeto,
    custoTotal,
    fechado: fechadas.length > 0,
    fechadoEm: fechadas[0]?.fechadoEm ?? null,
  };
}
