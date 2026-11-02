import { calcular, type EntradaDemandaInput, type ResultadoDemanda } from "@/modules/ferramentas/calc/electrical-demand";

import { TIPO_PONTO_ROTULO, totalDeCargas, type ConteudoEstudo, type TipoPonto } from "./conteudo";

/**
 * Conta do estudo — **puro**. Roda o MESMO motor da calculadora "Corrente e demanda"
 * (`calc/electrical-demand.ts`); aqui só se organiza a entrada (achatar os ambientes) e se agrupa a saída
 * (subtotal por ambiente e por tipo de ponto). Não grava resultado: quem chama recalcula.
 */

/** Rótulo do grupo "sem tipo de ponto" nos subtotais. */
export const SEM_TIPO_PONTO = "sem_tipo" as const;
export const ROTULO_SEM_TIPO = "Sem tipo definido";

export type SubtotalAmbiente = {
  id: string;
  nome: string;
  cargas: number;
  /** `null` quando o ambiente não tem carga. */
  resultado: ResultadoDemanda | null;
};

export type SubtotalTipoPonto = {
  tipo: TipoPonto | typeof SEM_TIPO_PONTO;
  rotulo: string;
  cargas: number;
  pInstaladaW: number;
  pDemandadaW: number;
  sDemandadaVA: number;
};

export type ResultadoEstudo = {
  /** `null` quando o estudo não tem nenhuma carga. */
  total: ResultadoDemanda | null;
  ambientes: SubtotalAmbiente[];
  porTipoPonto: SubtotalTipoPonto[];
};

/** Entrada do motor para o estudo inteiro: uma lista só, com "Ambiente — carga" na descrição. */
export function entradaDoMotor(c: ConteudoEstudo): EntradaDemandaInput {
  return {
    ...c.condicoes,
    cargas: c.ambientes.flatMap((a) => a.cargas.map((x) => ({ ...x, descricao: `${a.nome} — ${x.descricao}` }))),
  };
}

export function calcularEstudo(c: ConteudoEstudo): ResultadoEstudo {
  const cargas = totalDeCargas(c);
  if (cargas === 0) {
    return { total: null, ambientes: c.ambientes.map((a) => ({ id: a.id, nome: a.nome, cargas: 0, resultado: null })), porTipoPonto: [] };
  }
  const total = calcular(entradaDoMotor(c));
  const ambientes = c.ambientes.map((a): SubtotalAmbiente => ({
    id: a.id,
    nome: a.nome,
    cargas: a.cargas.length,
    resultado: a.cargas.length > 0 ? calcular({ ...c.condicoes, cargas: a.cargas }) : null,
  }));

  // `total.linhas` segue a ordem de `entradaDoMotor`: ambiente a ambiente, carga a carga.
  const tipos = c.ambientes.flatMap((a) => a.cargas.map((x) => x.tipoPonto ?? SEM_TIPO_PONTO));
  const grupos = new Map<SubtotalTipoPonto["tipo"], SubtotalTipoPonto>();
  total.linhas.forEach((l, i) => {
    const tipo = tipos[i];
    const g = grupos.get(tipo) ?? {
      tipo,
      rotulo: tipo === SEM_TIPO_PONTO ? ROTULO_SEM_TIPO : TIPO_PONTO_ROTULO[tipo],
      cargas: 0,
      pInstaladaW: 0,
      pDemandadaW: 0,
      sDemandadaVA: 0,
    };
    g.cargas += 1;
    g.pInstaladaW += l.pInstalada;
    g.pDemandadaW += l.pDemandada;
    g.sDemandadaVA += l.sDemandada;
    grupos.set(tipo, g);
  });

  return { total, ambientes, porTipoPonto: [...grupos.values()] };
}
