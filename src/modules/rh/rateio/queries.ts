import "server-only";
import { prisma } from "@/lib/prisma";
import { minutosSessao } from "@/modules/ponto/format";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { horasDiaPadraoEmLote } from "@/modules/rh/escalas/queries";
import type { Contratacao } from "@/generated/prisma/enums";
import { custosDoMes } from "@/modules/rh/rateio/custo-hora/dados";
import {
  calculoDoMes, divisorMinutos, limitesDoMesSP, minutosNoIntervalo, naturezaDaSessao, ratearCusto, type NaturezaLinha,
} from "@/modules/rh/rateio/custo-hora/distribuicao";

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
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, contratacao: true, salarioBase: true } }),
  ]);
  const rec = new Map(recursos.map((r) => [r.userId, r.custoHora != null ? Number(r.custoHora) : null]));
  const sal = new Map(users.map((u) => [u.id, u.salarioBase != null ? Number(u.salarioBase) : null]));
  const esc = await horasDiaPadraoEmLote(users.map((u) => ({ id: u.id, contratacao: u.contratacao })));
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

/**
 * Cálculo ANTIGO (meses antes do corte `rh.rateio.calculoNovoDesde`): custo/hora = salário ÷
 * horas-mês, sem encargos, só sessões com projeto. Mantido para os meses fechados nele.
 */
export async function calcularRateioLegado(ano: number, mes: number): Promise<RateioRow[]> {
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

export type LinhaRateio = {
  userId: string;
  projetoId: string | null;
  natureza: NaturezaLinha;
  contratacao: Contratacao | null;
  minutos: number;
  custoCent: number;
};

const CHAVE_CORTE = "rh.rateio.calculoNovoDesde";

/** Mês (AAAA-MM) a partir do qual vale o cálculo com encargos (decisão 8). */
export async function corteCalculoNovo(): Promise<string> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_CORTE } });
  return typeof c?.valor === "string" && /^\d{4}-\d{2}$/.test(c.valor) ? c.valor : "2026-10";
}

/**
 * Cálculo novo (decisões 1, 6, 9, 15): custo do mês com encargos ÷ horas marcadas (sócio: jornada
 * de referência), sessões recortadas no mês, linha "não alocado" com o resto. Entra também quem
 * tem custo no mês sem sessão nenhuma — o custo vai inteiro para "não alocado".
 */
export async function calcularRateioV2(ano: number, mes: number, agora: Date = new Date()): Promise<LinhaRateio[]> {
  const { inicio, fim } = limitesDoMesSP(ano, mes);
  const iniMes = new Date(Date.UTC(ano, mes - 1, 1));
  const fimMes = new Date(Date.UTC(ano, mes, 0));
  const [sessoes, comCusto] = await Promise.all([
    prisma.sessaoTrabalho.findMany({
      where: { inicio: { lt: fim }, OR: [{ fim: null }, { fim: { gt: inicio } }] },
      select: { userId: true, projetoId: true, tipoAlocacao: true, inicio: true, fim: true },
    }),
    prisma.vinculo.findMany({
      where: {
        contratacao: { in: ["clt", "estagio", "pro_labore"] },
        dataInicio: { lte: fimMes },
        OR: [{ dataFim: null }, { dataFim: { gte: iniMes } }],
      },
      select: { userId: true },
    }),
  ]);
  const userIds = [...new Set([...sessoes.map((s) => s.userId), ...comCusto.map((v) => v.userId)])];
  const custos = await custosDoMes(ano, mes, userIds);

  type Linha = { projetoId: string | null; natureza: NaturezaLinha; minutos: number };
  const porUser = new Map<string, { linhas: Map<string, Linha>; total: number }>();
  for (const s of sessoes) {
    const minutos = minutosNoIntervalo(s.inicio, s.fim, inicio, fim, agora);
    if (minutos === 0) continue;
    const natureza = naturezaDaSessao(s.projetoId, s.tipoAlocacao);
    const projetoId = natureza === "nao_alocado" ? null : s.projetoId;
    const chave = `${natureza}|${projetoId ?? ""}`;
    const acc = porUser.get(s.userId) ?? { linhas: new Map<string, Linha>(), total: 0 };
    const l = acc.linhas.get(chave) ?? { projetoId, natureza, minutos: 0 };
    l.minutos += minutos;
    acc.linhas.set(chave, l);
    acc.total += minutos;
    porUser.set(s.userId, acc);
  }

  const out: LinhaRateio[] = [];
  for (const userId of userIds) {
    const acc = porUser.get(userId) ?? { linhas: new Map<string, Linha>(), total: 0 };
    const c = custos.get(userId);
    const contratacao = c?.contratacao ?? null;
    const totalCent = c?.custo?.totalCent ?? 0;
    const divisor = divisorMinutos({ contratacao, minutosMarcados: acc.total, jornadaReferenciaMin: c?.jornadaReferenciaMin ?? 0 });
    const { porLinha, naoApontadoCent } = ratearCusto(totalCent, divisor, [...acc.linhas].map(([chave, l]) => ({ chave, minutos: l.minutos })));
    const naoAlocado = { minutos: 0, custoCent: naoApontadoCent };
    for (const [chave, l] of acc.linhas) {
      const custoCent = porLinha.get(chave) ?? 0;
      if (l.natureza === "nao_alocado") {
        naoAlocado.minutos += l.minutos;
        naoAlocado.custoCent += custoCent;
      } else {
        out.push({ userId, projetoId: l.projetoId, natureza: l.natureza, contratacao, minutos: l.minutos, custoCent });
      }
    }
    if (naoAlocado.minutos > 0 || naoAlocado.custoCent > 0) {
      out.push({ userId, projetoId: null, natureza: "nao_alocado", contratacao, minutos: naoAlocado.minutos, custoCent: naoAlocado.custoCent });
    }
  }
  return out;
}

/** Rateio do mês no cálculo que vale para ele: antigo antes do corte, novo a partir dele. */
export async function calcularRateioDoMes(ano: number, mes: number): Promise<{ calculo: "legado" | "v2"; linhas: LinhaRateio[] }> {
  const calculo = calculoDoMes(ano, mes, await corteCalculoNovo());
  if (calculo === "v2") return { calculo, linhas: await calcularRateioV2(ano, mes) };
  const rows = await calcularRateioLegado(ano, mes);
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
    select: { id: true, contratacao: true },
  });
  const contr = new Map(users.map((u) => [u.id, u.contratacao]));
  return {
    calculo,
    linhas: rows.map((r) => ({
      userId: r.userId,
      projetoId: r.projetoId,
      natureza: "projeto" as const,
      contratacao: contr.get(r.userId) ?? null,
      minutos: r.minutos,
      custoCent: Math.round(r.custo * 100),
    })),
  };
}

/** Rateio do mês agregado por projeto, para o painel do gestor. */
export async function rateioMesGestor(ano: number, mes: number) {
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 1);
  const [{ linhas }, fechamento, sessoesSemProjeto] = await Promise.all([
    calcularRateioDoMes(ano, mes),
    prisma.fechamentoRateio.findUnique({ where: { ano_mes: { ano, mes } }, select: { fechadoEm: true } }),
    prisma.sessaoTrabalho.findMany({
      where: { inicio: { gte: ini, lt: fim }, projetoId: null },
      select: { inicio: true, fim: true, tipoAlocacao: true },
    }),
  ]);

  const doProjeto = linhas.filter((l) => l.projetoId);
  const projIds = [...new Set(doProjeto.map((r) => r.projetoId!))];
  const projetos = await prisma.projeto.findMany({ where: { id: { in: projIds } }, select: { id: true, codigo: true, nome: true } });
  const pinfo = new Map(projetos.map((p) => [p.id, p]));

  const agg = new Map<string, { projeto: string; minutos: number; centavos: number }>();
  for (const r of doProjeto) {
    const p = pinfo.get(r.projetoId!);
    const label = p ? `${formatarCodigo(p.codigo)} · ${p.nome}` : r.projetoId!;
    const cur = agg.get(r.projetoId!) ?? { projeto: label, minutos: 0, centavos: 0 };
    cur.minutos += r.minutos;
    cur.centavos += r.custoCent;
    agg.set(r.projetoId!, cur);
  }
  const custoNaoAlocadoCent = linhas.filter((l) => l.natureza === "nao_alocado").reduce((s, l) => s + l.custoCent, 0);
  const custoTotalCent = linhas.reduce((s, l) => s + l.custoCent, 0);

  const alocacoesSemProjeto = { semProjeto: 0, reuniaoInterna: 0, reuniaoExterna: 0 };
  for (const s of sessoesSemProjeto) {
    const minutos = minutosSessao(s.inicio, s.fim);
    if (s.tipoAlocacao === "reuniao_interna") alocacoesSemProjeto.reuniaoInterna += minutos;
    else if (s.tipoAlocacao === "reuniao_externa") alocacoesSemProjeto.reuniaoExterna += minutos;
    else alocacoesSemProjeto.semProjeto += minutos;
  }

  return {
    porProjeto: [...agg.values()]
      .map((a) => ({ projeto: a.projeto, minutos: a.minutos, custo: a.centavos / 100 }))
      .sort((a, b) => b.minutos - a.minutos),
    ...alocacoesSemProjeto,
    custoNaoAlocado: custoNaoAlocadoCent / 100,
    custoTotal: custoTotalCent / 100,
    fechado: fechamento != null,
    fechadoEm: fechamento?.fechadoEm ?? null,
  };
}
