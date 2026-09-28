/**
 * Apagar a EAP inteira de um projeto — para recomeçar com outro modelo quando o escolhido foi o errado (pedido do
 * dono, 2026-09-27). PURO: decide se pode; `apagar-eap-service.ts` lê o banco e apaga.
 *
 * Só enquanto o cronograma é um RASCUNHO LIMPO. O que se pendura numa linha da EAP e não pode sumir calado:
 *  - linha de base / cronograma aprovado — é o combinado (a foto da base perderia o vínculo com a linha);
 *  - andamento (% ou data real) — é o registro do que aconteceu, e o Valor Agregado lê o histórico dele;
 *  - card no quadro gerado da linha — o card ficaria apontando para uma linha que não existe;
 *  - parcela de contrato ligada a um marco — é dinheiro: a parcela perderia a data de faturar.
 * Cada caso recusa com a frase que a tela mostra no botão desabilitado (ADR-0002) e que a action lança.
 */

export type SituacaoParaApagar = {
  linhas: number;
  temLinhaDeBase: boolean;
  cronogramaAprovado: boolean;
  /** Linhas com % acima de zero, data real ou histórico de avanço. */
  comAndamento: number;
  /** Cards do quadro gerados de linhas desta EAP. */
  cards: number;
  /** Parcelas de contrato (por entrega) ligadas a marcos desta EAP. */
  parcelasDeContrato: number;
};

export const MOTIVO_EAP_VAZIA = "A EAP deste projeto já está vazia.";

export function impedimentoParaApagarEap(s: SituacaoParaApagar): string | null {
  if (s.linhas === 0) return MOTIVO_EAP_VAZIA;
  if (s.temLinhaDeBase || s.cronogramaAprovado) {
    return "O cronograma já foi aprovado (tem linha de base): apagar a EAP mudaria o combinado. Use Replanejar.";
  }
  if (s.comAndamento > 0) {
    return `${s.comAndamento} linha(s) já têm andamento (% ou data real). Apagar a EAP perderia esse registro.`;
  }
  if (s.cards > 0) {
    return `${s.cards} card(s) do quadro de tarefas foram gerados desta EAP. Apagar deixaria os cards soltos.`;
  }
  if (s.parcelasDeContrato > 0) {
    return `${s.parcelasDeContrato} parcela(s) do contrato estão ligadas a marcos desta EAP. Tire a ligação no contrato antes.`;
  }
  return null;
}
