/**
 * Baixa completa (M7). Puro, sem I/O, dinheiro em centavos.
 *
 * Antes, `valorEfetivo` fazia três papéis ao mesmo tempo (parcial, juros e desconto) e o juro pago ia parar na
 * categoria da própria conta; desconto não existia (pagar menos sempre virava "parcial", com resto em aberto). Agora
 * a baixa separa:
 *  - **principal**: quanto do título está sendo quitado (menor que o valor = parcial, o resto fica em aberto);
 *  - **juros e multa**: acréscimo — despesa financeira no pagamento, receita financeira no recebimento;
 *  - **desconto**: abatimento — só quitando o título inteiro ("quitar com desconto"); receita financeira no
 *    pagamento (desconto obtido), despesa financeira no recebimento (desconto concedido).
 *
 * Cada acessório vira um lançamento realizado próprio, na mesma conta e data, ligado ao principal
 * (`acessorioDeId`): o caixa sai certo (principal ± acessórios = o que o banco movimentou) e a DRE mostra cada coisa
 * na sua linha, sem mexer em nenhum leitor de relatório.
 */

import { chaveNfe } from "@/lib/campos/chave-nfe";
import { soDigitos } from "@/lib/documento";

export type TipoDoLancamento = "receita" | "despesa";

/** Chaves das categorias do sistema (criadas pela migração `baixa_completa`). */
export const CHAVE_JUROS_PAGOS = "despesa_juros_multas_pagos";
export const CHAVE_DESCONTOS_OBTIDOS = "receita_descontos_obtidos";
export const CHAVE_JUROS_RECEBIDOS = "receita_juros_multas_recebidos";
export const CHAVE_DESCONTOS_CONCEDIDOS = "despesa_descontos_concedidos";

export type EntradaDaBaixa = {
  tipo: TipoDoLancamento;
  /** Valor do título, em centavos. */
  valor: number;
  /** Quanto do título é quitado agora; ausente = o título inteiro. */
  principal?: number | null;
  juros?: number;
  multa?: number;
  desconto?: number;
};

export type Acessorio = {
  tipo: TipoDoLancamento;
  chaveCategoria: string;
  valor: number;
  rotulo: "Juros e multa" | "Desconto obtido" | "Desconto concedido";
};

export type PlanoDaBaixa = {
  /** Vai para `valorEfetivo` do principal; `null` = o título inteiro (sem efetivo). */
  valorEfetivo: number | null;
  /** O que fica em aberto (pagamento parcial), ou `null`. */
  restante: number | null;
  acessorios: Acessorio[];
  /** O que efetivamente entrou ou saiu da conta: principal + juros + multa − desconto. */
  caixa: number;
};

export const MOTIVO_PRINCIPAL_MAIOR = "O valor quitado não pode passar do valor do título: o que for a mais é juros ou multa.";
export const MOTIVO_PRINCIPAL_ZERO = "Informe quanto do título está sendo quitado.";
export const MOTIVO_NEGATIVO = "Juros, multa e desconto não podem ser negativos.";
export const MOTIVO_DESCONTO_PARCIAL = "Desconto só quitando o título inteiro. No pagamento parcial, o que falta fica em aberto.";
export const MOTIVO_DESCONTO_MAIOR = "O desconto não pode ser maior que o valor do título.";

export function planejarBaixa(e: EntradaDaBaixa): PlanoDaBaixa | { erro: string } {
  const juros = e.juros ?? 0;
  const multa = e.multa ?? 0;
  const desconto = e.desconto ?? 0;
  if (juros < 0 || multa < 0 || desconto < 0) return { erro: MOTIVO_NEGATIVO };
  const principal = e.principal ?? e.valor;
  if (!(principal > 0)) return { erro: MOTIVO_PRINCIPAL_ZERO };
  if (principal > e.valor) return { erro: MOTIVO_PRINCIPAL_MAIOR };
  const parcial = principal < e.valor;
  if (desconto > 0 && parcial) return { erro: MOTIVO_DESCONTO_PARCIAL };
  if (desconto >= e.valor) return { erro: MOTIVO_DESCONTO_MAIOR };

  const acessorios: Acessorio[] = [];
  const acrescimo = juros + multa;
  if (acrescimo > 0) {
    acessorios.push(
      e.tipo === "despesa"
        ? { tipo: "despesa", chaveCategoria: CHAVE_JUROS_PAGOS, valor: acrescimo, rotulo: "Juros e multa" }
        : { tipo: "receita", chaveCategoria: CHAVE_JUROS_RECEBIDOS, valor: acrescimo, rotulo: "Juros e multa" },
    );
  }
  if (desconto > 0) {
    acessorios.push(
      e.tipo === "despesa"
        ? { tipo: "receita", chaveCategoria: CHAVE_DESCONTOS_OBTIDOS, valor: desconto, rotulo: "Desconto obtido" }
        : { tipo: "despesa", chaveCategoria: CHAVE_DESCONTOS_CONCEDIDOS, valor: desconto, rotulo: "Desconto concedido" },
    );
  }
  return {
    valorEfetivo: parcial ? principal : null,
    restante: parcial ? e.valor - principal : null,
    acessorios,
    caixa: principal + acrescimo - desconto,
  };
}

/** Chave de acesso da NF: regra no catálogo de campos (`lib/campos/chave-nfe.ts`). */
export { chaveNfeValida } from "@/lib/campos/chave-nfe";
export const normalizarChaveNfe = (texto: string): string => soDigitos(texto);
export const MOTIVO_CHAVE_INVALIDA = chaveNfe.mensagem;
