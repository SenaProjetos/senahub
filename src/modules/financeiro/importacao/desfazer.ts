/**
 * Quando um lote importado pode ser desfeito (A8). Puro, sem I/O.
 *
 * Desfazer apagava DE VEZ os lançamentos do lote, inclusive os que alguém já tinha conciliado com o
 * extrato, distribuído entre as caixinhas ou editado (com anexos, histórico e baixa): o trabalho
 * sumia junto. Agora desfazer é exclusão lógica, e só vale para o lote intocado — o que já foi
 * trabalhado sai um a um, pela tela de lançamentos.
 */

export type UsoDoLote = {
  /** Com transação do banco conciliada. */
  conciliados: number;
  /** Receita distribuída (ou pulada) entre as caixinhas. */
  distribuidos: number;
  /** Mudados depois da importação: baixa, edição, prioridade, caixinha… */
  alterados: number;
};

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

export function motivoParaNaoDesfazer(u: UsoDoLote): string | null {
  const partes = [
    u.conciliados > 0 ? plural(u.conciliados, "conciliado com o extrato", "conciliados com o extrato") : null,
    u.distribuidos > 0 ? plural(u.distribuidos, "distribuído entre as caixinhas", "distribuídos entre as caixinhas") : null,
    u.alterados > 0 ? plural(u.alterados, "alterado depois da importação", "alterados depois da importação") : null,
  ].filter((p): p is string => p !== null);
  if (partes.length === 0) return null;
  return `Esta importação já foi trabalhada (${partes.join(", ")}): desfazer apagaria esse trabalho. Exclua um a um, em Lançamentos, os que precisam sair.`;
}
