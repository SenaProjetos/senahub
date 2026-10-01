/**
 * Caixa × reservado × livre (spec §4 e §16). Puro.
 *
 *   R_k = max(0, alocado − usado)     reservado da caixinha
 *   L*  = caixa − R                   livre bruto (com sinal)
 *   L   = max(0, L*)                  dinheiro livre (nunca negativo)
 *   Dsc = max(0, R − caixa)           reserva descoberta
 *   caixa = R + L − Dsc               sempre
 */
import type { Centavos } from "@/modules/financeiro/liquidez/tipos";

export function reservadoDaCaixinha(alocado: Centavos, usado: Centavos): { reservado: Centavos; usoAlemDoReservado: Centavos } {
  return { reservado: Math.max(0, alocado - usado), usoAlemDoReservado: Math.max(0, usado - alocado) };
}

export type Posicao = {
  caixa: Centavos;
  reservado: Centavos;
  livreBruto: Centavos;
  livre: Centavos;
  descoberto: Centavos;
};

export function posicao(caixa: Centavos, reservado: Centavos): Posicao {
  const livreBruto = caixa - reservado;
  return { caixa, reservado, livreBruto, livre: Math.max(0, livreBruto), descoberto: Math.max(0, -livreBruto) };
}

/**
 * Saída ligada a uma caixinha: o que a caixinha cobre sai do reservado; só o resto sai do livre.
 * Assim o livre nunca cai duas vezes pelo mesmo pagamento.
 */
export function consumirCaixinha(valor: Centavos, reservadoAntes: Centavos): { coberto: Centavos; semCobertura: Centavos; reservadoDepois: Centavos } {
  const coberto = Math.min(valor, Math.max(0, reservadoAntes));
  return { coberto, semCobertura: valor - coberto, reservadoDepois: reservadoAntes - coberto };
}
