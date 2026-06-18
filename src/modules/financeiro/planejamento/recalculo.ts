/**
 * Recálculo do plano de pagamentos (puro, sem I/O). Percorre as linhas na ordem,
 * debitando o valor planejado do saldo disponível enquanto houver saldo.
 *
 * Uma linha é "contemplada" quando o saldo corrente comporta o valor planejado;
 * caso não comporte, ela não debita (o saldo segue para tentar contemplar linhas
 * seguintes mais baratas). Linhas não selecionadas não participam do consumo.
 */

export type LinhaPlano = {
  selecionada: boolean;
  valorPlanejado: number;
};

export type LinhaCalculada = {
  /** Saldo disponível após esta linha. */
  saldoAcumulado: number;
  contemplada: boolean;
};

export type IndicadoresPlano = {
  saldoInicial: number;
  totalPlanejado: number;
  totalContemplado: number;
  saldoRemanescente: number;
  contempladas: number;
  naoContempladas: number;
  /** % do total planejado que cabe no saldo disponível. */
  percentualCobertura: number;
};

export type ResultadoPlano = {
  linhas: LinhaCalculada[];
  indicadores: IndicadoresPlano;
};

export function calcularPlano(saldoInicial: number, linhas: LinhaPlano[]): ResultadoPlano {
  let saldo = saldoInicial;
  let totalPlanejado = 0;
  let totalContemplado = 0;
  let contempladas = 0;
  let naoContempladas = 0;

  const calculadas: LinhaCalculada[] = linhas.map((l) => {
    if (!l.selecionada) {
      return { saldoAcumulado: saldo, contemplada: false };
    }
    totalPlanejado += l.valorPlanejado;
    const cabe = saldo >= l.valorPlanejado;
    if (cabe) {
      saldo = Math.round((saldo - l.valorPlanejado) * 100) / 100;
      totalContemplado += l.valorPlanejado;
      contempladas += 1;
    } else {
      naoContempladas += 1;
    }
    return { saldoAcumulado: saldo, contemplada: cabe };
  });

  return {
    linhas: calculadas,
    indicadores: {
      saldoInicial,
      totalPlanejado: Math.round(totalPlanejado * 100) / 100,
      totalContemplado: Math.round(totalContemplado * 100) / 100,
      saldoRemanescente: Math.round((saldoInicial - totalContemplado) * 100) / 100,
      contempladas,
      naoContempladas,
      percentualCobertura: totalPlanejado > 0 ? Math.round((totalContemplado / totalPlanejado) * 1000) / 10 : 100,
    },
  };
}
