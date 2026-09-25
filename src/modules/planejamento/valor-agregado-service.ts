import "server-only";
import { prisma } from "@/lib/prisma";
import { diasUteisEntre } from "@/lib/calendario-trabalho";
import { minutosPorDiaSessao } from "@/modules/ponto/engine";
import { montarCalendario, paraDia, planoDoProjeto } from "./agenda";
import { calcularRegua, type IndicesEvm, type LinhaBaseEvm, type ResultadoRegua } from "./valor-agregado";

/** Uma apuração gravada (F8): índices de cada régua; nulo = desconhecido naquela data. */
export type ApuracaoHistorico = {
  dataStatus: string;
  baselineNumero: number;
  idpHoras: number | null;
  idcHoras: number | null;
  /** Só para quem vê o financeiro; senão sempre nulo. */
  idpCusto: number | null;
  idcCusto: number | null;
};

export type ValorAgregadoProjeto =
  | { ok: false; motivo: string }
  | {
      ok: true;
      baselineNumero: number;
      dataStatus: string;
      horas: ResultadoRegua;
      /** Nulo = o viewer não vê custo (taxa de remuneração). */
      custo: ResultadoRegua | null;
      /** Horas apontadas no projeto até a Data de Status (todas, com ou sem tarefa). */
      horasApontadas: number;
      avisos: string[];
      /** Apurações gravadas, da mais recente para a mais antiga. */
      historico: ApuracaoHistorico[];
    };

/** Dia seguinte, `YYYY-MM-DD`. */
const diaSeguinte = (dia: string) => new Date(Date.parse(`${dia}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Valor Agregado do projeto na Data de Status (F8), contra a linha de base MAIS RECENTE — regras em
 * `valor-agregado.ts`.
 *
 * O realizado é o APONTADO no ponto: toda sessão no projeto até o fim da Data de Status, com ou sem
 * tarefa escolhida (a tarefa é opcional — D20 — e contar só as com tarefa esconderia a maior parte
 * das horas). Em R$, cada hora vale o custo/hora de quem apontou, a mesma base do orçamento.
 * Pagamento de PJ por entrega NÃO entra: quem não aponta horas não aparece no realizado.
 */
export async function valorAgregadoDoProjeto(
  projetoId: string,
  opcoes: { verCusto: boolean },
): Promise<ValorAgregadoProjeto> {
  const [cronograma, baseline] = await Promise.all([
    prisma.cronogramaProjeto.findUnique({ where: { projetoId }, select: { dataStatus: true } }),
    prisma.eapBaseline.findFirst({
      where: { projetoId },
      orderBy: { numero: "desc" },
      select: {
        numero: true,
        linhas: {
          select: { tarefaId: true, inicio: true, fim: true, trabalhoHoras: true, custoPrevisto: true, resumo: true },
        },
      },
    }),
  ]);
  if (!baseline || baseline.linhas.length === 0) {
    return { ok: false, motivo: "Aprove o cronograma: o Valor Agregado mede o projeto contra a linha de base." };
  }
  if (!cronograma?.dataStatus) {
    return { ok: false, motivo: "Defina a Data de Status: é a data em que o Valor Agregado é apurado (D39)." };
  }
  const dataStatus = paraDia(cronograma.dataStatus);

  const plano = await planoDoProjeto(projetoId);
  const progresso = new Map<string, number>();
  for (const [id, l] of plano?.resultado.linhas ?? []) progresso.set(id, l.progresso);

  const linhas: LinhaBaseEvm[] = baseline.linhas.map((l) => ({
    tarefaId: l.tarefaId && progresso.has(l.tarefaId) ? l.tarefaId : null,
    inicio: paraDia(l.inicio),
    fim: paraDia(l.fim),
    horas: l.trabalhoHoras == null ? null : Number(l.trabalhoHoras),
    custo: l.custoPrevisto == null ? null : Number(l.custoPrevisto),
    resumo: l.resumo,
  }));

  // Realizado: minutos apontados por pessoa, até o fim da Data de Status (dia local de Brasília).
  const agora = new Date();
  const sessoes = await prisma.sessaoTrabalho.findMany({
    where: { projetoId, inicio: { lt: new Date(`${diaSeguinte(dataStatus)}T00:00:00-03:00`) } },
    select: { userId: true, inicio: true, fim: true },
  });
  const minutosPorPessoa = new Map<string, number>();
  for (const s of sessoes) {
    let m = 0;
    for (const [dia, minutos] of minutosPorDiaSessao(s.inicio, s.fim, agora)) if (dia <= dataStatus) m += minutos;
    if (m > 0) minutosPorPessoa.set(s.userId, (minutosPorPessoa.get(s.userId) ?? 0) + m);
  }
  const minutosTotais = [...minutosPorPessoa.values()].reduce((a, b) => a + b, 0);
  const horasApontadas = Math.round((minutosTotais / 60) * 100) / 100;

  const anos = new Set<number>();
  for (const l of linhas) {
    anos.add(Number(l.inicio.slice(0, 4)));
    anos.add(Number(l.fim.slice(0, 4)));
  }
  anos.add(Number(dataStatus.slice(0, 4)));
  const cal = await montarCalendario([...anos]);
  const diasUteis = (a: string, b: string) => diasUteisEntre(a, b, cal);

  const horas = calcularRegua({ regua: "horas", linhas, progresso, dataStatus, diasUteis, realizado: horasApontadas });

  let custo: ResultadoRegua | null = null;
  if (opcoes.verCusto) {
    const taxas = new Map(
      (
        await prisma.recurso.findMany({
          where: { userId: { in: [...minutosPorPessoa.keys()] }, custoHora: { not: null } },
          select: { userId: true, custoHora: true },
        })
      ).map((r) => [r.userId, Number(r.custoHora)]),
    );
    const semTaxa = [...minutosPorPessoa.keys()].filter((u) => !taxas.has(u));
    const realizado = semTaxa.length
      ? null
      : Math.round(
          [...minutosPorPessoa.entries()].reduce((s, [u, m]) => s + Math.round((m / 60) * (taxas.get(u) as number) * 100), 0),
        ) / 100;
    custo = calcularRegua({
      regua: "custo",
      linhas,
      progresso,
      dataStatus,
      diasUteis,
      realizado,
      motivoRealizado: semTaxa.length
        ? `${semTaxa.length} pessoa(s) apontaram horas no projeto sem custo/hora cadastrado em Recursos.`
        : null,
    });
  }

  const avisos: string[] = [];
  const naBaseline = new Set(baseline.linhas.map((l) => l.tarefaId).filter((x): x is string => x != null));
  const folhasHoje = [...(plano?.resultado.linhas ?? new Map()).entries()].filter(([, l]) => !l.ehResumo);
  const foraDaBase = folhasHoje.filter(([id]) => !naBaseline.has(id)).length;
  if (foraDaBase > 0) {
    avisos.push(`${foraDaBase} atividade(s) criada(s) depois da linha de base não entram — replaneje para incluí-las.`);
  }
  const excluidas = linhas.filter((l) => !l.resumo && l.tarefaId == null).length;
  if (excluidas > 0) avisos.push(`${excluidas} atividade(s) da linha de base foram excluídas e contam como não feitas.`);

  const apuracoes = await prisma.valorAgregadoApuracao.findMany({
    where: { projetoId },
    orderBy: { dataStatus: "desc" },
    take: 12,
  });
  const indice = (a: unknown, b: unknown) => {
    const x = a == null ? null : Number(a);
    const y = b == null ? null : Number(b);
    return x == null || y == null || !(y > 0) ? null : Math.round((x / y) * 1000) / 1000;
  };
  const historico: ApuracaoHistorico[] = apuracoes.map((a) => ({
    dataStatus: paraDia(a.dataStatus),
    baselineNumero: a.baselineNumero,
    idpHoras: indice(a.vaHoras, a.vpHoras),
    idcHoras: indice(a.vaHoras, a.crHoras),
    idpCusto: opcoes.verCusto ? indice(a.vaCusto, a.vpCusto) : null,
    idcCusto: opcoes.verCusto ? indice(a.vaCusto, a.crCusto) : null,
  }));

  return {
    ok: true,
    baselineNumero: baseline.numero,
    dataStatus,
    horas,
    custo,
    horasApontadas,
    avisos,
    historico,
  };
}

/**
 * Fotografa a apuração do Valor Agregado na Data de Status atual (F8). Chamada ao definir a Data de
 * Status e na foto semanal — refazer na mesma data atualiza a linha. Sem baseline ou sem Data de
 * Status não grava nada. Grava as DUAS réguas (quem lê decide quem vê R$).
 */
export async function gravarApuracaoValorAgregado(projetoId: string): Promise<boolean> {
  const r = await valorAgregadoDoProjeto(projetoId, { verCusto: true });
  if (!r.ok) return false;
  const i = (x: ResultadoRegua | null): IndicesEvm | null => (x?.ok ? x.indices : null);
  const h = i(r.horas);
  const c = i(r.custo);
  const dados = {
    baselineNumero: r.baselineNumero,
    ontHoras: h?.ont ?? null,
    vpHoras: h?.vp ?? null,
    vaHoras: h?.va ?? null,
    crHoras: h?.cr ?? null,
    ontCusto: c?.ont ?? null,
    vpCusto: c?.vp ?? null,
    vaCusto: c?.va ?? null,
    crCusto: c?.cr ?? null,
  };
  const dataStatus = new Date(`${r.dataStatus}T00:00:00.000Z`);
  await prisma.valorAgregadoApuracao.upsert({
    where: { projetoId_dataStatus: { projetoId, dataStatus } },
    create: { projetoId, dataStatus, ...dados },
    update: dados,
  });
  return true;
}
