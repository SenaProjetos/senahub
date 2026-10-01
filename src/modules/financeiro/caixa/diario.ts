/**
 * Fluxo de caixa DIÁRIO (F7, plano I14). Puro: monta a série dia a dia juntando as duas metades da
 * história — antes de hoje, o REALIZADO (baixa e conciliação, pela data de realização); de hoje em
 * diante, o PREVISTO do cenário escolhido, que vem da série do motor.
 *
 * O acumulado nunca é somado "do começo": o passado é reconstruído DE TRÁS PARA A FRENTE a partir do
 * caixa de hoje (`caixaAtual − o que foi realizado depois daquele dia`), e o futuro é o saldo que o
 * motor já calculou. Assim o gráfico encosta exatamente no caixa atual nos dois lados, sem uma
 * segunda conta de saldo que pode divergir da Visão geral.
 *
 * Perna de transferência não entra: ela move dinheiro entre contas da empresa, não é entrada nem
 * saída (ADR-0008). Quem filtra por UMA conta é o chamador — aí a perna é um movimento real daquela
 * conta e vem na lista.
 */
import { diaMes, somarDias } from "@/modules/financeiro/liquidez/datas";
import type { DiaProjetado } from "@/modules/financeiro/liquidez/motor";
import type { Centavos, DataIso, TipoMovimento } from "@/modules/financeiro/liquidez/tipos";

export type MovimentoRealizado = {
  /** Data de realização (`dataConfirmacao`), `YYYY-MM-DD`. */
  data: DataIso;
  tipo: TipoMovimento;
  valor: Centavos;
  descricao: string;
};

export type LinhaDiaria = {
  /** Primeiro dia do grupo (no agrupamento por dia, o próprio dia). */
  dia: DataIso;
  /** Rótulo pronto: "05/10" no dia, "05/10 a 11/10" na semana, "10/2026" no mês. */
  rotulo: string;
  /** `realizado` = antes de hoje; `previsto` = hoje em diante. Um grupo misto conta como previsto. */
  tipo: "realizado" | "previsto";
  entradas: Centavos;
  saidas: Centavos;
  /** entradas − saídas. */
  saldoDia: Centavos;
  /** Saldo nas contas no fim do grupo. */
  acumulado: Centavos;
  /** Descrição do maior movimento do grupo; `null` em grupo sem movimento. */
  maior: string | null;
};

export type Agrupamento = "dia" | "semana" | "mes";

export type EntradaDiaria = {
  hoje: DataIso;
  /** Primeiro dia mostrado (pode ser anterior a hoje). */
  de: DataIso;
  /** Último dia mostrado; normalmente o fim do horizonte do motor. */
  ate: DataIso;
  /** S0 — caixa de hoje (só realizados), o ponto onde as duas metades se encontram. */
  caixaAtual: Centavos;
  realizados: readonly MovimentoRealizado[];
  /** Série do motor, de hoje até o fim do horizonte. */
  serie: readonly DiaProjetado[];
  /** Maior movimento PREVISTO de cada dia (descrição), quando houver. */
  maiorPrevisto?: ReadonlyMap<DataIso, string>;
};

function dias(de: DataIso, ate: DataIso): DataIso[] {
  const out: DataIso[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) out.push(d);
  return out;
}

/** Série diária crua (um item por dia do intervalo), antes de qualquer agrupamento. */
export function serieDiaria(e: EntradaDiaria): LinhaDiaria[] {
  const porDia = new Map<DataIso, { entradas: Centavos; saidas: Centavos; maior: { valor: Centavos; descricao: string } | null }>();
  const garantir = (d: DataIso) => {
    const atual = porDia.get(d) ?? { entradas: 0, saidas: 0, maior: null };
    porDia.set(d, atual);
    return atual;
  };

  for (const m of e.realizados) {
    if (m.data < e.de || m.data > e.ate) continue;
    const acc = garantir(m.data);
    if (m.tipo === "receita") acc.entradas += m.valor;
    else acc.saidas += m.valor;
    if (!acc.maior || m.valor > acc.maior.valor) acc.maior = { valor: m.valor, descricao: m.descricao };
  }
  for (const d of e.serie) {
    if (d.dia < e.de || d.dia > e.ate) continue;
    const acc = garantir(d.dia);
    acc.entradas += d.entradas;
    acc.saidas += d.saidas;
    const desc = e.maiorPrevisto?.get(d.dia);
    if (desc && !acc.maior) acc.maior = { valor: Math.max(d.entradas, d.saidas), descricao: desc };
  }

  // Acumulado do passado, de trás para a frente: o saldo do dia d é o caixa de hoje menos tudo o que
  // foi realizado DEPOIS de d.
  const realizadoDepoisDe = new Map<DataIso, Centavos>();
  const listaPassado = dias(e.de, somarDias(e.hoje, -1));
  let acumuladoReverso = 0;
  for (const d of [...listaPassado].reverse()) {
    realizadoDepoisDe.set(d, acumuladoReverso);
    const movs = porDia.get(d);
    if (movs) acumuladoReverso += movs.entradas - movs.saidas;
  }

  const saldoDoMotor = new Map(e.serie.map((d) => [d.dia, d.saldo]));
  let ultimo = e.caixaAtual;
  return dias(e.de, e.ate).map((d) => {
    const movs = porDia.get(d) ?? { entradas: 0, saidas: 0, maior: null };
    const futuro = d >= e.hoje;
    // Passado: o caixa de hoje menos o que foi realizado DEPOIS deste dia (o próprio dia já está
    // dentro, porque o saldo é o do fechamento dele).
    const acumulado = futuro ? (saldoDoMotor.get(d) ?? ultimo) : e.caixaAtual - (realizadoDepoisDe.get(d) ?? 0);
    ultimo = acumulado;
    return {
      dia: d,
      rotulo: diaMes(d),
      tipo: futuro ? "previsto" : "realizado",
      entradas: movs.entradas,
      saidas: movs.saidas,
      saldoDia: movs.entradas - movs.saidas,
      acumulado,
      maior: movs.maior?.descricao ?? null,
    } satisfies LinhaDiaria;
  });
}

/** Começo da semana (segunda-feira) do dia, em `YYYY-MM-DD`. */
function inicioDaSemana(d: DataIso): DataIso {
  const data = new Date(`${d}T00:00:00.000Z`);
  const dow = (data.getUTCDay() + 6) % 7; // 0 = segunda
  return somarDias(d, -dow);
}

/**
 * Agrupa a série diária. O saldo acumulado do grupo é o do ÚLTIMO dia dele (é um estoque, não se
 * soma); entradas, saídas e o maior movimento se somam/comparam dentro do grupo.
 */
export function agruparLinhas(serie: readonly LinhaDiaria[], como: Agrupamento): LinhaDiaria[] {
  if (como === "dia") return [...serie];
  const grupos = new Map<string, LinhaDiaria[]>();
  for (const l of serie) {
    const chave = como === "semana" ? inicioDaSemana(l.dia) : l.dia.slice(0, 7);
    const atual = grupos.get(chave) ?? [];
    atual.push(l);
    grupos.set(chave, atual);
  }
  return [...grupos.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([chave, itens]) => {
      const ultimo = itens[itens.length - 1];
      const entradas = itens.reduce((s, x) => s + x.entradas, 0);
      const saidas = itens.reduce((s, x) => s + x.saidas, 0);
      return {
        dia: itens[0].dia,
        rotulo: como === "semana" ? `${diaMes(itens[0].dia)} a ${diaMes(ultimo.dia)}` : `${chave.slice(5, 7)}/${chave.slice(0, 4)}`,
        // Grupo que encosta no futuro é previsto: dizer "realizado" prometeria o que não aconteceu.
        tipo: itens.some((x) => x.tipo === "previsto") ? "previsto" : "realizado",
        entradas,
        saidas,
        saldoDia: entradas - saidas,
        acumulado: ultimo.acumulado,
        maior: itens.reduce<{ valor: Centavos; descricao: string } | null>((maior, x) => {
          const v = Math.max(x.entradas, x.saidas);
          return x.maior && (!maior || v > maior.valor) ? { valor: v, descricao: x.maior } : maior;
        }, null)?.descricao ?? null,
      } satisfies LinhaDiaria;
    });
}

export type TotaisDoFluxo = {
  realizado: { entradas: Centavos; saidas: Centavos; de: DataIso | null; ate: DataIso | null };
  previsto: { entradas: Centavos; saidas: Centavos; de: DataIso | null; ate: DataIso | null };
};

/** Totais das duas metades, com o intervalo de cada uma (os rótulos dos KPIs saem daqui). */
export function totaisDoFluxo(serie: readonly LinhaDiaria[]): TotaisDoFluxo {
  const metade = (tipo: LinhaDiaria["tipo"]) => {
    const linhas = serie.filter((l) => l.tipo === tipo);
    return {
      entradas: linhas.reduce((s, l) => s + l.entradas, 0),
      saidas: linhas.reduce((s, l) => s + l.saidas, 0),
      de: linhas[0]?.dia ?? null,
      ate: linhas[linhas.length - 1]?.dia ?? null,
    };
  };
  return { realizado: metade("realizado"), previsto: metade("previsto") };
}
