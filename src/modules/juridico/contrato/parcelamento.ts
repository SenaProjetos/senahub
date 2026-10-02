import { somarMesesUtc } from "@/lib/data";
import { dividirEmParcelas } from "@/modules/projetos/receita/parcelas";

/**
 * Cronograma de recebíveis de um contrato (spec
 * `docs/superpowers/specs/2026-08-26-gerenciador-contratos.md`, Fase G).
 *
 * ## Não reimplementa a divisão do dinheiro
 *
 * A primeira versão deste arquivo recalculava a partilha em centavos — e descobriu-se depois que
 * `modules/projetos/receita/parcelas.ts` já fazia exatamente isso, com a mesma regra (arredonda
 * para baixo e joga o resíduo na PRIMEIRA parcela, para a soma fechar). Duas implementações da
 * mesma regra de arredondamento de dinheiro é precisamente o tipo de divergência que este plano
 * vinha eliminando em `contrato/estado.ts`; então aqui só se COMPÕE o que já existe.
 *
 * O que este módulo acrescenta ao que já havia: as datas de vencimento e as guardas de entrada
 * (`dividirEmParcelas` devolve `[]` ou parcelas zeradas para entrada inválida, em vez de recusar).
 */

export type Parcela = {
  /** 1-based, para exibir "1/3". */
  numero: number;
  valor: number;
  vencimento: Date;
};

// Soma de meses em UTC (31/01 + 1 mês = 28/02): `somarMesesUtc` em `@/lib/data` — o `addMonths` do
// date-fns opera em hora local e a parcela pula de mês em fuso negativo.

export class ErroParcelamento extends Error {}

/**
 * Divide `valor` em `quantidade` parcelas mensais a partir de `primeiroVencimento`.
 *
 * A soma das parcelas é SEMPRE igual ao valor original — propriedade garantida por
 * `dividirEmParcelas` e verificada no teste daqui também, porque é o que o contrato promete.
 */
export function gerarParcelas(valor: number, quantidade: number, primeiroVencimento: Date): Parcela[] {
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new ErroParcelamento("Número de parcelas deve ser um inteiro maior que zero.");
  }
  if (!(valor > 0)) {
    throw new ErroParcelamento("Valor do contrato deve ser maior que zero para gerar parcelas.");
  }
  if (Math.round(valor * 100) < quantidade) {
    // 3 centavos em 4 parcelas daria parcela de zero — cobrança de nada.
    throw new ErroParcelamento("Valor pequeno demais para esse número de parcelas.");
  }

  return dividirEmParcelas(valor, quantidade).map((v, i) => ({
    numero: i + 1,
    valor: v,
    vencimento: somarMesesUtc(primeiroVencimento, i),
  }));
}

/** Descrição da parcela no extrato financeiro: "Contrato X — parcela 2/5". */
export function descricaoParcela(tituloContrato: string, numero: number, total: number): string {
  return `${tituloContrato} — parcela ${numero}/${total}`;
}
