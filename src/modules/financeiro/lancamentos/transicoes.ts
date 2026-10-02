/**
 * Máquina de situações do lançamento (N1 do núcleo do Financeiro). Pura, sem I/O.
 *
 * Toda ação que muda a situação de um lançamento pergunta aqui ANTES de gravar, com o estado lido
 * no banco: o mesmo motivo serve à recusa do servidor (`ActionError`) e ao item desabilitado do
 * menu (ADR-0002). Antes cada ação tinha a sua regra, e o servidor aceitava caminhos impossíveis:
 * cancelado virava pago, despesa em aprovação era paga ao conciliar, lançamento conciliado era
 * cancelado ou excluído e a transação do banco ficava "conciliada" com nada (A2), e ações por id
 * agiam sobre lançamento excluído (A12).
 *
 *   previsto ── baixar/conciliar ──▶ confirmado ── estornar ──▶ previsto
 *   previsto ── cancelar ──▶ cancelado ── reabrir ──▶ previsto (ou aguardando, se foi rejeitado)
 *   aguardando ── aprovar ──▶ previsto · aguardando ── rejeitar/cancelar ──▶ cancelado
 *   previsao (cronograma) só muda pela sincronização do contrato — nunca por aqui.
 */

export type Situacao = "previsto" | "aguardando_aprovacao" | "confirmado" | "cancelado" | "previsao";

export type Operacao =
  | "baixar"
  | "conciliar"
  | "estornar"
  | "cancelar"
  | "reabrir"
  | "excluir"
  | "editar"
  | "aprovar"
  | "rejeitar";

/** Quem controla o lançamento além do Financeiro (a porta certa para mexer nele). */
export type Origem = "manual" | "projetista" | "art" | "previsao";

export type EstadoDoLancamento = {
  status: Situacao;
  excluido: boolean;
  /** Tem transação do banco conciliada com ele. */
  conciliado: boolean;
  /** Receita já distribuída (ou pulada) entre as caixinhas. */
  distribuido: boolean;
  origem: Origem;
  /** Rejeitado na aprovação (tem motivo de rejeição). */
  rejeitado: boolean;
};

export const MOTIVO_EXCLUIDO = "Lançamento excluído.";
export const MOTIVO_PREVISAO_CRONOGRAMA =
  "É uma previsão do cronograma (contrato por entrega): ela anda com o marco e vira cobrança quando a parcela é faturada no contrato.";
export const MOTIVO_EM_APROVACAO = "Despesa aguardando aprovação: aprove antes de pagar.";
export const MOTIVO_JA_PAGO = "Já foi pago ou recebido.";
export const MOTIVO_CANCELADO_REABRA = "Lançamento cancelado: reabra antes.";
export const MOTIVO_JA_CANCELADO = "Lançamento já cancelado.";
export const MOTIVO_PAGO_ESTORNE = "Já foi pago ou recebido: estorne antes.";
export const MOTIVO_SO_PAGO_ESTORNA = "Só se estorna o que já foi pago ou recebido.";
export const MOTIVO_SO_CANCELADO_REABRE = "Só se reabre o que foi cancelado.";
export const MOTIVO_CONCILIADO = "Conciliado com o extrato: desconcilie a transação antes.";
export const MOTIVO_PROJETISTA = "Este lançamento é de um pagamento de produção — corrija ou estorne pela tela de Produção.";
export const MOTIVO_ART = "Este lançamento é da taxa de uma ART — altere pela aba ARTs do projeto.";
export const MOTIVO_NAO_AGUARDA = "Lançamento não está aguardando aprovação.";

/** Por que a operação não pode acontecer; `null` = pode. */
export function motivoParaNao(op: Operacao, e: EstadoDoLancamento): string | null {
  if (e.excluido) return MOTIVO_EXCLUIDO;
  if (e.status === "previsao") return MOTIVO_PREVISAO_CRONOGRAMA;

  switch (op) {
    case "baixar":
      if (e.status === "aguardando_aprovacao") return MOTIVO_EM_APROVACAO;
      if (e.status === "confirmado") return MOTIVO_JA_PAGO;
      if (e.status === "cancelado") return MOTIVO_CANCELADO_REABRA;
      return null;

    case "conciliar":
      // Já pago pode ser conciliado (G1c: religar depois de desfazer uma conciliação errada).
      if (e.conciliado) return "Já conciliado com outra transação.";
      if (e.status === "aguardando_aprovacao") return MOTIVO_EM_APROVACAO;
      if (e.status === "cancelado") return MOTIVO_CANCELADO_REABRA;
      return null;

    case "estornar":
      if (e.status !== "confirmado") return MOTIVO_SO_PAGO_ESTORNA;
      if (e.conciliado) return MOTIVO_CONCILIADO;
      if (e.origem === "projetista") return MOTIVO_PROJETISTA;
      return null;

    case "cancelar":
      if (e.origem === "projetista") return MOTIVO_PROJETISTA;
      if (e.origem === "art") return MOTIVO_ART;
      if (e.status === "cancelado") return MOTIVO_JA_CANCELADO;
      if (e.status === "confirmado") return e.conciliado ? MOTIVO_CONCILIADO : MOTIVO_PAGO_ESTORNE;
      return null;

    case "reabrir":
      if (e.status !== "cancelado") return MOTIVO_SO_CANCELADO_REABRE;
      // Cancelado pela origem (pagamento de produção cancelado, ART sem taxa): reabrir aqui
      // ressuscitaria uma despesa que a origem já não reconhece.
      if (e.origem === "projetista") return MOTIVO_PROJETISTA;
      if (e.origem === "art") return MOTIVO_ART;
      return null;

    case "excluir":
      if (e.origem === "projetista") return MOTIVO_PROJETISTA;
      if (e.origem === "art") return MOTIVO_ART;
      if (e.conciliado) return MOTIVO_CONCILIADO;
      // Excluir não desfaz a distribuição: sumiria a receita e ficaria o reservado.
      if (e.distribuido) return "Esta receita já foi distribuída entre as caixinhas: estorne antes de excluir.";
      return null;

    case "editar":
      if (e.status === "cancelado") return MOTIVO_CANCELADO_REABRA;
      return null;

    case "aprovar":
    case "rejeitar":
      return e.status === "aguardando_aprovacao" ? null : MOTIVO_NAO_AGUARDA;
  }
}

/** Situação depois da operação (só tem sentido quando `motivoParaNao` devolveu `null`). */
export function situacaoDepois(op: Operacao, e: EstadoDoLancamento): Situacao {
  switch (op) {
    case "baixar":
    case "conciliar":
      return "confirmado";
    case "estornar":
    case "aprovar":
      return "previsto";
    case "cancelar":
    case "rejeitar":
      return "cancelado";
    case "reabrir":
      // Despesa rejeitada volta para a fila de aprovação, não direto para o pagamento.
      return e.rejeitado ? "aguardando_aprovacao" : "previsto";
    case "excluir":
    case "editar":
      return e.status;
  }
}

/** Estado a partir das colunas do banco (mesma leitura em toda ação). */
export function estadoDoLancamento(l: {
  status: string;
  excluidoEm: Date | string | null;
  transacao: unknown | null;
  distribuicao: unknown | null;
  pagamentoProjetistaId: string | null;
  ehDeArt: boolean;
  motivoRejeicao: string | null;
}): EstadoDoLancamento {
  const status = l.status as Situacao;
  return {
    status,
    excluido: l.excluidoEm != null,
    conciliado: l.transacao != null,
    distribuido: l.distribuicao != null,
    origem: status === "previsao" ? "previsao" : l.pagamentoProjetistaId ? "projetista" : l.ehDeArt ? "art" : "manual",
    rejeitado: l.motivoRejeicao != null,
  };
}
