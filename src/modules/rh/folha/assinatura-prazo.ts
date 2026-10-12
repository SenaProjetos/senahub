/**
 * Quando o holerite passa a ser COBRADO do funcionário (tarja na barra superior): só no dia do
 * pagamento da folha, não no instante em que o RH fecha. Fechar e reabrir para corrigir é rotina
 * nos dias antes do pagamento — cobrar a assinatura nesse intervalo só fazia o funcionário assinar
 * o que ainda ia mudar.
 *
 * "Dia do pagamento" = vencimento da conta a pagar da folha (5º dia útil do mês seguinte). Pago
 * antes do vencimento (`confirmado`) também libera a cobrança. Pura: sem Prisma/Next.
 */

export type ContaDaFolha = {
  status: string;
  /** `YYYY-MM-DD`; null = a conta não tem vencimento. */
  vencimento: string | null;
};

/**
 * @param temConta   a folha tem conta a pagar vinculada (`FolhaPagamento.lancamentoId`).
 * @param conta      a conta vinculada, ou null quando foi apagada.
 * @param hoje       `YYYY-MM-DD` do dia de São Paulo (`diaDeSaoPaulo()`).
 *
 * Sem conta vinculada (folha antiga, ou conta apagada) não há data de pagamento a esperar:
 * cobra já, como antes — esperar nada seria nunca cobrar.
 */
export function assinaturaJaDevida(temConta: boolean, conta: ContaDaFolha | null, hoje: string): boolean {
  if (!temConta || !conta) return true;
  if (conta.status === "confirmado") return true;
  if (!conta.vencimento) return true;
  return conta.vencimento <= hoje;
}
