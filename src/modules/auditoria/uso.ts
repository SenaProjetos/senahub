/**
 * Engine puro da análise de uso por seção. Sem Prisma/Next — recebe eventos
 * normalizados de Acessos (page-views) e Ações (AuditLog) e devolve métricas,
 * séries e distribuições. Reaproveita `montarHeatmap` (seção × dia).
 */

export type EventoAcesso = { secao: string; userId: string; em: Date };
export type EventoAcao = {
  modulo: string;
  acao: string;
  userId: string | null;
  em: Date;
  resultado: string; // sucesso | falha | bloqueado | rejeitado
};

export type MetricaSecao = {
  secao: string;
  acessos: number;
  usuariosUnicos: number;
  deltaPct: number | null; // null = sem base anterior (novo)
  deltaDir: "up" | "down" | "flat";
  ultimoEm: string | null; // ISO
  acoes: number;
  topAcao: { acao: string; total: number } | null;
  topUsuario: { userId: string; total: number } | null;
  falhas: number; // falha + rejeitado
  bloqueios: number; // tentativas sem permissão
  pctFalha: number; // falhas / acoes * 100
};

function diaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Seção a partir da rota: 1º segmento ("/" → "inicio"). */
export function secaoDoPath(path: string): string {
  const limpo = (path.split("?")[0] ?? "").split("#")[0] ?? "";
  const seg = limpo.split("/").filter(Boolean)[0];
  return seg ?? "inicio";
}

/** Variação percentual entre período atual e anterior. */
export function delta(atual: number, anterior: number): { pct: number | null; direcao: "up" | "down" | "flat" } {
  if (anterior === 0) return { pct: atual > 0 ? null : 0, direcao: atual > 0 ? "up" : "flat" };
  const pct = ((atual - anterior) / anterior) * 100;
  return { pct, direcao: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat" };
}

/** Série diária (contagem por dia) na janela — pronta para o TrendLine. */
export function serieDiaria(
  eventos: { em: Date }[],
  opts: { dias: number; hoje: Date },
): { rotulo: string; valor: number }[] {
  const nDias = Math.max(1, opts.dias);
  const dias: string[] = [];
  for (let i = nDias - 1; i >= 0; i--) {
    const d = new Date(opts.hoje);
    d.setDate(opts.hoje.getDate() - i);
    dias.push(diaISO(d));
  }
  const idx = new Map(dias.map((d, i) => [d, i]));
  const valores = new Array<number>(nDias).fill(0);
  for (const e of eventos) {
    const i = idx.get(diaISO(e.em));
    if (i !== undefined) valores[i] += 1;
  }
  return dias.map((d, i) => ({ rotulo: `${d.slice(8, 10)}/${d.slice(5, 7)}`, valor: valores[i] }));
}

/** Distribuição dia-da-semana (0=domingo) × hora (0-23). */
export function distribuicaoDiaHora(eventos: { em: Date }[]): { matriz: number[][]; max: number } {
  const matriz = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const e of eventos) matriz[e.em.getDay()][e.em.getHours()] += 1;
  let max = 0;
  for (const row of matriz) for (const v of row) if (v > max) max = v;
  return { matriz, max };
}

/** Métricas por seção, combinando acessos (page-views) e ações (AuditLog). */
export function metricasPorSecao(
  acessos: EventoAcesso[],
  acessosAnteriores: EventoAcesso[],
  acoes: EventoAcao[],
): MetricaSecao[] {
  type Acc = {
    acessos: number;
    users: Set<string>;
    ultimo: number;
    acoes: number;
    porAcao: Map<string, number>;
    porUser: Map<string, number>;
    falhas: number;
    bloqueios: number;
  };
  const m = new Map<string, Acc>();
  const get = (k: string): Acc => {
    let a = m.get(k);
    if (!a) {
      a = { acessos: 0, users: new Set(), ultimo: 0, acoes: 0, porAcao: new Map(), porUser: new Map(), falhas: 0, bloqueios: 0 };
      m.set(k, a);
    }
    return a;
  };

  for (const e of acessos) {
    const a = get(e.secao);
    a.acessos += 1;
    a.users.add(e.userId);
    a.porUser.set(e.userId, (a.porUser.get(e.userId) ?? 0) + 1);
    const t = e.em.getTime();
    if (t > a.ultimo) a.ultimo = t;
  }

  const ant = new Map<string, number>();
  for (const e of acessosAnteriores) ant.set(e.secao, (ant.get(e.secao) ?? 0) + 1);

  for (const e of acoes) {
    const a = get(e.modulo);
    a.acoes += 1;
    a.porAcao.set(e.acao, (a.porAcao.get(e.acao) ?? 0) + 1);
    if (e.userId) {
      a.users.add(e.userId);
      a.porUser.set(e.userId, (a.porUser.get(e.userId) ?? 0) + 1);
    }
    if (e.resultado === "falha" || e.resultado === "rejeitado") a.falhas += 1;
    if (e.resultado === "bloqueado") a.bloqueios += 1;
    const t = e.em.getTime();
    if (t > a.ultimo) a.ultimo = t;
  }

  const top = (mapa: Map<string, number>) =>
    [...mapa.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0];

  const linhas: MetricaSecao[] = [];
  for (const [secao, a] of m) {
    const d = delta(a.acessos, ant.get(secao) ?? 0);
    const ta = top(a.porAcao);
    const tu = top(a.porUser);
    linhas.push({
      secao,
      acessos: a.acessos,
      usuariosUnicos: a.users.size,
      deltaPct: d.pct,
      deltaDir: d.direcao,
      ultimoEm: a.ultimo ? new Date(a.ultimo).toISOString() : null,
      acoes: a.acoes,
      topAcao: ta ? { acao: ta[0], total: ta[1] } : null,
      topUsuario: tu ? { userId: tu[0], total: tu[1] } : null,
      falhas: a.falhas,
      bloqueios: a.bloqueios,
      pctFalha: a.acoes > 0 ? (a.falhas / a.acoes) * 100 : 0,
    });
  }
  linhas.sort((x, y) => y.acessos - x.acessos || y.acoes - x.acoes || x.secao.localeCompare(y.secao));
  return linhas;
}
