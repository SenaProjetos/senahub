import { extensoMoeda } from "@/lib/extenso";
import { arredondarMoeda } from "../honorarios";

/**
 * Plano de pagamento da proposta composta: marcos com percentual → valor e extenso calculados.
 *
 * Puro, sem I/O. É a regra que impede o erro mais caro achado nas 163 propostas: parcelas que
 * somavam R$ 52.250 para um total de R$ 47.500 (a 3ª parcela "40%" escrita como R$ 23.750, que
 * é 50%), e planos cujos percentuais somavam 105% ou 110%. Aqui o percentual é o dado, o valor é
 * calculado, e um plano que não fecha 100% é **recusado** — nunca "corrigido em silêncio".
 *
 * Valor e extenso não são gravados no banco (ADR-0006): saem daqui sempre que se renderiza.
 */

export type ParcelaEntrada = {
  /** Marco de pagamento: "Assinatura do contrato", "Entrega do estudo preliminar"… */
  descricao: string;
  /** Percentual do total, 0 < p ≤ 100, até 2 casas (33,33 + 33,33 + 33,34). */
  percentual: number;
  /** Prazo em texto livre ("5 dias após o aceite", "à vista"). Só repassado. */
  prazo?: string;
};

export type ParcelaCalculada = ParcelaEntrada & {
  /** Valor em reais, 2 casas. A soma de todas é EXATAMENTE o total. */
  valor: number;
  valorExtenso: string;
  /** Percentual como se escreve: "30%", "33,33%". */
  percentualRotulo: string;
};

export type ErroPlano =
  | "sem_parcelas"
  | "total_invalido"
  | "percentual_invalido"
  | "soma_diferente_de_100"
  | "total_pequeno_demais";

export type ResultadoPlano =
  | { ok: true; parcelas: ParcelaCalculada[]; total: number }
  | { ok: false; erro: ErroPlano; mensagem: string; somaPercentuais?: number };

/** Percentual em pontos-base (1% = 100): trabalhar em inteiro evita 33,33 + 33,33 + 33,34 ≠ 100. */
const paraPontosBase = (p: number) => Math.round(p * 100);

/** Percentual escrito em pt-BR, sem zeros à direita: 30 → "30%", 33.33 → "33,33%", 12.5 → "12,5%". */
export function rotuloPercentual(p: number): string {
  return `${String(Math.round(p * 100) / 100).replace(".", ",")}%`;
}

const falha = (erro: ErroPlano, mensagem: string, somaPercentuais?: number): ResultadoPlano => ({
  ok: false,
  erro,
  mensagem,
  somaPercentuais,
});

/**
 * Soma dos percentuais, para o editor mostrar "soma 105%" enquanto a pessoa digita — sem precisar
 * de um total nem de um plano válido. Arredondada em 2 casas (é a precisão que o plano aceita).
 */
export function somaPercentuais(parcelas: readonly { percentual: number }[]): number {
  const bp = parcelas.reduce((s, p) => s + (Number.isFinite(p.percentual) ? paraPontosBase(p.percentual) : 0), 0);
  return bp / 100;
}

/**
 * Calcula o plano. Cada parcela é o total × percentual, arredondado ao centavo (meio para cima);
 * **a última é o que falta** para fechar o total — então a soma é exata no centavo e o valor da
 * última pode diferir alguns centavos do percentual "puro" (é o esperado: alguém tem de absorver).
 *
 * `total` é o valor final da proposta, já com desconto: esta função não conhece desconto.
 */
export function calcularParcelas(total: number, parcelas: readonly ParcelaEntrada[]): ResultadoPlano {
  if (!Number.isFinite(total) || total <= 0) {
    return falha("total_invalido", "Informe o valor total da proposta para calcular as parcelas.");
  }
  if (parcelas.length === 0) return falha("sem_parcelas", "O plano de pagamento precisa de ao menos uma parcela.");

  for (const [i, p] of parcelas.entries()) {
    if (!Number.isFinite(p.percentual) || p.percentual <= 0 || p.percentual > 100) {
      return falha("percentual_invalido", `Parcela ${i + 1}: o percentual deve ser maior que 0% e no máximo 100%.`);
    }
  }

  const soma = somaPercentuais(parcelas);
  if (paraPontosBase(soma) !== 10000) {
    return falha(
      "soma_diferente_de_100",
      `Os percentuais das parcelas somam ${rotuloPercentual(soma)}; precisam somar 100%.`,
      soma,
    );
  }

  // Centavos em BigInt: total × pontos-base passa de 2^53 para valores grandes (1e14 × 1e4).
  // `BigInt(...)` em vez de literal `1n`: o target do projeto é ES2017 (mesma escolha de honorarios.ts).
  const totalCentavos = BigInt(Math.round(arredondarMoeda(total) * 100));
  const DEZ_MIL = BigInt(10000);
  const DOIS = BigInt(2);

  const centavos: bigint[] = [];
  let acumulado = BigInt(0);
  parcelas.forEach((p, i) => {
    if (i === parcelas.length - 1) {
      centavos.push(totalCentavos - acumulado); // a última absorve o arredondamento
      return;
    }
    // total × bp / 10000, meio para cima, só com inteiros: (2·t·bp + 10000) / 20000.
    const valor = (DOIS * totalCentavos * BigInt(paraPontosBase(p.percentual)) + DEZ_MIL) / (DOIS * DEZ_MIL);
    centavos.push(valor);
    acumulado += valor;
  });

  // Só acontece com total de poucos centavos, onde arredondar cada parcela "para cima" passa do
  // total e sobraria valor negativo para a última.
  if (centavos[centavos.length - 1] < BigInt(0)) {
    return falha("total_pequeno_demais", "O total é pequeno demais para ser dividido nessas parcelas.");
  }

  const calculadas = parcelas.map((p, i): ParcelaCalculada => {
    const valor = Number(centavos[i]) / 100;
    return { ...p, valor, valorExtenso: extensoMoeda(valor), percentualRotulo: rotuloPercentual(p.percentual) };
  });
  return { ok: true, parcelas: calculadas, total: Number(totalCentavos) / 100 };
}
