import "server-only";
import { prisma } from "@/lib/prisma";
import { saldoBase } from "@/modules/financeiro/liquidez/saldo-base";
import { paraCentavos, paraReais } from "@/modules/financeiro/liquidez/dinheiro";
import { SEM_TRANSFERENCIA } from "@/modules/financeiro/natureza";
import { agruparLinhas, serieDiaria, totaisDoFluxo, type Agrupamento, type LinhaDiaria, type MovimentoRealizado, type TotaisDoFluxo } from "@/modules/financeiro/caixa/diario";
import { isoDeDataDoBanco, somarDias } from "@/modules/financeiro/liquidez/datas";
import { baseDoPlanejador } from "@/modules/financeiro/liquidez/queries";
import { projetar } from "@/modules/financeiro/liquidez/motor";
import type { Eixos } from "@/modules/financeiro/liquidez/cenario";
import type { Centavos, DataIso } from "@/modules/financeiro/liquidez/tipos";

/** Cenário do lado PREVISTO do fluxo diário. O realizado não tem cenário: já aconteceu. */
export type CenarioFluxo = "provavel" | "conservador";

export const EIXOS_DO_FLUXO: Record<CenarioFluxo, Eixos> = {
  provavel: { entradas: "provaveis", compromissos: "todos" },
  conservador: { entradas: "confirmadas", compromissos: "todos" },
};

/** Janelas de passado oferecidas na tela (dias antes de hoje). */
export const JANELAS_PASSADO = [15, 30, 60] as const;

export type FluxoDiario = {
  hoje: DataIso;
  de: DataIso;
  ate: DataIso;
  caixaAtual: Centavos;
  reservaMinima: Centavos;
  cenario: CenarioFluxo;
  agrupamento: Agrupamento;
  diasAtras: number;
  /** Série já agrupada, pronta para a tabela. */
  linhas: LinhaDiaria[];
  /** Série diária crua, para o gráfico. */
  diaria: LinhaDiaria[];
  totais: TotaisDoFluxo;
};

/**
 * Fluxo de caixa dia a dia (F7, plano I14): antes de hoje o REALIZADO pela data de realização,
 * de hoje em diante o PREVISTO do cenário escolhido — o mesmo motor do planejador e da Visão geral.
 * As pernas de transferência ficam fora das entradas e saídas (ADR-0008): elas trocam dinheiro de
 * conta, não entram nem saem da empresa.
 */
export async function fluxoDiario(o: { diasAtras?: number; horizonteDias?: number; cenario?: CenarioFluxo; agrupamento?: Agrupamento } = {}): Promise<FluxoDiario> {
  const diasAtras = (JANELAS_PASSADO as readonly number[]).includes(o.diasAtras ?? 0) ? (o.diasAtras as number) : JANELAS_PASSADO[0];
  const cenario: CenarioFluxo = o.cenario === "conservador" ? "conservador" : "provavel";
  const agrupamento: Agrupamento = o.agrupamento === "semana" || o.agrupamento === "mes" ? o.agrupamento : "dia";

  const base = await baseDoPlanejador({ horizonteDias: o.horizonteDias });
  const projecao = projetar({
    hoje: base.hoje,
    horizonteDias: base.horizonteDias,
    caixaAtual: base.caixaAtual,
    reservaMinima: base.reservaMinima,
    eventos: base.eventos,
    caixinhas: base.caixinhas,
    eixos: EIXOS_DO_FLUXO[cenario],
  });

  const de = somarDias(base.hoje, -diasAtras);
  const ate = projecao.fim;
  const realizadas = await prisma.lancamento.findMany({
    where: {
      status: "confirmado",
      excluidoEm: null,
      dataConfirmacao: { gte: new Date(`${de}T00:00:00.000Z`), lte: new Date(`${base.hoje}T23:59:59.999Z`) },
      ...SEM_TRANSFERENCIA,
    },
    select: { tipo: true, valor: true, valorEfetivo: true, dataConfirmacao: true, descricao: true },
  });
  const realizados: MovimentoRealizado[] = realizadas.flatMap((l) =>
    l.dataConfirmacao
      ? [{ data: isoDeDataDoBanco(l.dataConfirmacao), tipo: l.tipo, valor: paraCentavos(l.valorEfetivo ?? l.valor), descricao: l.descricao }]
      : [],
  );

  // Maior movimento PREVISTO de cada dia, pelo que o cenário realmente aplicou.
  const porId = new Map(base.eventos.map((e) => [e.id, e]));
  const maiorPrevisto = new Map<DataIso, string>();
  const maiorValor = new Map<DataIso, Centavos>();
  for (const p of projecao.eventos) {
    if (!p.aplicado || p.dia == null) continue;
    const ev = porId.get(p.id);
    if (!ev || ev.natureza === "transferencia") continue;
    if ((maiorValor.get(p.dia) ?? -1) < ev.valor) {
      maiorValor.set(p.dia, ev.valor);
      maiorPrevisto.set(p.dia, ev.descricao);
    }
  }

  const diaria = serieDiaria({ hoje: base.hoje, de, ate, caixaAtual: base.caixaAtual, realizados, serie: projecao.serie, maiorPrevisto });
  return {
    hoje: base.hoje,
    de,
    ate,
    caixaAtual: base.caixaAtual,
    reservaMinima: base.reservaMinima,
    cenario,
    agrupamento,
    diasAtras,
    linhas: agruparLinhas(diaria, agrupamento),
    diaria,
    totais: totaisDoFluxo(diaria),
  };
}

/**
 * Fluxo de caixa: saldo por conta (saldo inicial + confirmados) e
 * movimentos confirmados recentes. Considera valorEfetivo quando houver.
 */
export async function fluxoCaixa(limiteMovimentos = 50) {
  const [contas, confirmados] = await Promise.all([
    prisma.contaBancaria.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" } }),
    prisma.lancamento.findMany({
      where: { status: "confirmado" },
      orderBy: { dataConfirmacao: "desc" },
      include: {
        categoria: { select: { nome: true } },
        conta: { select: { id: true, nome: true } },
      },
    }),
  ]);

  // A conta do caixa atual mora em `saldoBase` (pura, testada) e é a MESMA que o planejador usa
  // como ponto de partida — a Visão geral e o planejador nunca mostram dois caixas diferentes.
  const base = saldoBase(
    contas.map((c) => ({ id: c.id, saldoInicial: paraCentavos(c.saldoInicial), saldoInicialEm: c.saldoInicialEm ? isoDeDataDoBanco(c.saldoInicialEm) : null })),
    confirmados.map((l) => ({
      contaId: l.contaId,
      tipo: l.tipo,
      valor: paraCentavos(l.valorEfetivo ?? l.valor),
      dataConfirmacao: l.dataConfirmacao ? isoDeDataDoBanco(l.dataConfirmacao) : null,
    })),
  );

  const contasComSaldo = contas.map((c) => ({
    id: c.id,
    nome: c.nome,
    saldo: paraReais(base.porConta[c.id] ?? 0),
  }));
  const saldoTotal = paraReais(base.total);

  const entradas = confirmados
    .filter((l) => l.tipo === "receita")
    .reduce((s, l) => s + Number(l.valorEfetivo ?? l.valor), 0);
  const saidas = confirmados
    .filter((l) => l.tipo === "despesa")
    .reduce((s, l) => s + Number(l.valorEfetivo ?? l.valor), 0);

  return {
    contas: contasComSaldo,
    saldoTotal,
    entradas,
    saidas,
    movimentos: confirmados.slice(0, limiteMovimentos),
  };
}
