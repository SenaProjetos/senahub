/**
 * Transferência entre contas próprias (M8). Puro, sem I/O.
 *
 * Uma transferência são DUAS pernas do livro caixa com o mesmo `transferenciaId`: uma despesa na conta de
 * origem e uma receita na de destino, mesmo valor, na categoria de natureza `transferencia`. Ela move o saldo
 * das duas contas e nunca entra no resultado (DRE/DFC/margem) — a natureza da categoria é quem garante.
 *
 * Criar, editar, dar baixa, estornar e excluir mexem nas DUAS pernas juntas, ou em nenhuma.
 */
import { MOTIVO_CONCILIADO } from "@/modules/financeiro/lancamentos/transicoes";

export type OperacaoDeTransferencia = "editar" | "excluir" | "baixar" | "estornar";

export type PernaDaTransferencia = {
  id: string;
  tipo: "receita" | "despesa";
  status: string;
  conciliado: boolean;
};

export const MOTIVO_MESMA_CONTA = "Escolha duas contas diferentes: a transferência leva o dinheiro de uma para outra.";
export const MOTIVO_VALOR = "O valor da transferência tem que ser maior que zero.";
export const MOTIVO_INCOMPLETA = "Esta transferência não tem as duas pernas: confira o livro caixa antes de mexer nela.";
export const MOTIVO_PERNAS_DIFERENTES =
  "As duas pernas desta transferência estão em situações diferentes (uma paga, outra em aberto): acerte uma delas antes.";
export const MOTIVO_NAO_ESTA_PREVISTA = "Só se dá baixa numa transferência agendada (ainda em aberto).";
export const MOTIVO_NAO_ESTA_PAGA = "Só se estorna uma transferência que já aconteceu.";
export const MOTIVO_TRANSFERENCIA_CANCELADA = "Esta transferência está cancelada.";

/** Por que a transferência nova não pode ser criada; `null` = pode. */
export function motivoParaNaoCriar(i: { origemId: string; destinoId: string; valorCentavos: number }): string | null {
  if (!i.origemId || !i.destinoId) return "Escolha a conta de origem e a de destino.";
  if (i.origemId === i.destinoId) return MOTIVO_MESMA_CONTA;
  if (!(i.valorCentavos > 0)) return MOTIVO_VALOR;
  return null;
}

export type SituacaoDaTransferencia = "agendada" | "realizada" | "cancelada" | "inconsistente";

/** Situação do par: as duas pernas têm que concordar. */
export function situacaoDaTransferencia(pernas: readonly Pick<PernaDaTransferencia, "status">[]): SituacaoDaTransferencia {
  if (pernas.length !== 2) return "inconsistente";
  const [a, b] = pernas;
  if (a.status !== b.status) return "inconsistente";
  if (a.status === "confirmado") return "realizada";
  if (a.status === "previsto") return "agendada";
  if (a.status === "cancelado") return "cancelada";
  return "inconsistente";
}

/** A transferência admite esta operação? Mesma frase para o servidor e para o item desabilitado do menu. */
export function motivoParaNaoMexer(op: OperacaoDeTransferencia, pernas: readonly PernaDaTransferencia[]): string | null {
  if (pernas.length !== 2) return MOTIVO_INCOMPLETA;
  const s = situacaoDaTransferencia(pernas);
  if (s === "cancelada") return MOTIVO_TRANSFERENCIA_CANCELADA;
  if (s === "inconsistente") return MOTIVO_PERNAS_DIFERENTES;
  if (pernas[0].tipo === pernas[1].tipo) return MOTIVO_INCOMPLETA;
  // Conciliada com o extrato de qualquer das contas: o banco já registrou o movimento.
  if ((op === "editar" || op === "excluir" || op === "estornar") && pernas.some((p) => p.conciliado)) return MOTIVO_CONCILIADO;
  if (op === "baixar" && s !== "agendada") return MOTIVO_NAO_ESTA_PREVISTA;
  if (op === "estornar" && s !== "realizada") return MOTIVO_NAO_ESTA_PAGA;
  return null;
}

/** Descrição das duas pernas quando a pessoa não escreveu uma. */
export function descricaoDaTransferencia(origemNome: string, destinoNome: string): string {
  return `Transferência ${origemNome} → ${destinoNome}`;
}
