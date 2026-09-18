import type { EstagioNegociacao, StatusProspeccao } from "@/generated/prisma/client";
import { ESTAGIO_LABEL, transicaoPermitida } from "@/modules/comercial/jornada";
import { STATUS_PROSPECCAO_LABEL, podeQualificar } from "@/modules/comercial/prospeccao";

/**
 * Board único de Prospecção + Negociação (ADR-0004). Puro: sem Prisma, sem I/O — client-safe.
 *
 * Um card é um `Lead` enquanto está na prospecção e passa a ser a `Negociacao` depois de
 * qualificado. O lead em `OPORTUNIDADE_CRIADA` NÃO aparece: quem o representa é a negociação que
 * a qualificação criou (`Negociacao.leadId @unique`). Mostrar os dois duplicaria o negócio.
 */
export const COLUNAS_FUNIL = [
  "IDENTIFICADO",
  "CONTATO_INICIADO",
  "EM_CONTATO",
  "QUALIFICADO",
  "LEVANTAMENTO",
  "ORCAMENTO",
  "PROPOSTA_ENVIADA",
  "NEGOCIACAO",
  "CONTRATADO",
  "ENCERRADOS",
] as const;
export type ColunaFunil = (typeof COLUNAS_FUNIL)[number];

export const COLUNAS_FUNIL_LEAD = [
  "IDENTIFICADO",
  "CONTATO_INICIADO",
  "EM_CONTATO",
  "QUALIFICADO",
] as const satisfies readonly StatusProspeccao[];

export const COLUNAS_FUNIL_NEGOCIACAO = [
  "LEVANTAMENTO",
  "ORCAMENTO",
  "PROPOSTA_ENVIADA",
  "NEGOCIACAO",
  "CONTRATADO",
] as const satisfies readonly EstagioNegociacao[];

/** Os 6 status terminais que o grupo "Encerrados" junta — cada card mostra o seu. */
export const ENCERRADOS_LEAD = [
  "SEM_OPORTUNIDADE",
  "EM_ESPERA",
  "DESCARTADO",
] as const satisfies readonly StatusProspeccao[];
export const ENCERRADOS_NEGOCIACAO = [
  "PERDIDO",
  "EM_ESPERA",
  "CANCELADO",
] as const satisfies readonly EstagioNegociacao[];

/** Colunas que nascem recolhidas para quem nunca mexeu no board. */
export const FECHADAS_PADRAO: readonly ColunaFunil[] = ["ENCERRADOS"];
export const COOKIE_COLUNAS_FECHADAS = "comercial_funil_fechadas";

export const COLUNA_FUNIL_LABEL: Record<ColunaFunil, string> = {
  IDENTIFICADO: STATUS_PROSPECCAO_LABEL.IDENTIFICADO,
  CONTATO_INICIADO: STATUS_PROSPECCAO_LABEL.CONTATO_INICIADO,
  EM_CONTATO: STATUS_PROSPECCAO_LABEL.EM_CONTATO,
  QUALIFICADO: STATUS_PROSPECCAO_LABEL.QUALIFICADO,
  LEVANTAMENTO: ESTAGIO_LABEL.LEVANTAMENTO,
  ORCAMENTO: ESTAGIO_LABEL.ORCAMENTO,
  PROPOSTA_ENVIADA: ESTAGIO_LABEL.PROPOSTA_ENVIADA,
  NEGOCIACAO: ESTAGIO_LABEL.NEGOCIACAO,
  CONTRATADO: ESTAGIO_LABEL.CONTRATADO,
  ENCERRADOS: "Encerrados",
};

const incluso = <T extends string>(lista: readonly T[], valor: string): valor is T =>
  (lista as readonly string[]).includes(valor);

export function ehColunaFunil(valor: string): valor is ColunaFunil {
  return incluso(COLUNAS_FUNIL, valor);
}

/** Lê o cookie de colunas recolhidas. Ausente = padrão; presente e vazio = todas abertas. */
export function lerColunasFechadas(valor: string | undefined): Set<ColunaFunil> {
  if (valor === undefined) return new Set(FECHADAS_PADRAO);
  return new Set(valor.split(",").filter(ehColunaFunil));
}

export type CardRef =
  | { tipo: "LEAD"; status: StatusProspeccao }
  | { tipo: "NEGOCIACAO"; estagio: EstagioNegociacao };

/** Onde o card mora no board. `null` = não é exibido (lead já qualificado). */
export function colunaDoCard(card: CardRef): ColunaFunil | null {
  if (card.tipo === "LEAD") {
    if (incluso(COLUNAS_FUNIL_LEAD, card.status)) return card.status;
    if (incluso(ENCERRADOS_LEAD, card.status)) return "ENCERRADOS";
    return null;
  }
  if (incluso(COLUNAS_FUNIL_NEGOCIACAO, card.estagio)) return card.estagio;
  return "ENCERRADOS";
}

export type OpcaoEncerramento =
  | { tipo: "LEAD"; para: StatusProspeccao; label: string }
  | { tipo: "NEGOCIACAO"; para: EstagioNegociacao; label: string };

export type Soltura =
  | { acao: "nada" }
  | { acao: "recusar"; mensagem: string }
  | { acao: "mover-lead"; para: StatusProspeccao }
  /** `reativa`: lead fora do fluxo — a UI pede confirmação e o servidor exige o consentimento. */
  | { acao: "qualificar"; reativa: boolean; statusAtual: StatusProspeccao }
  | { acao: "mover-negociacao"; para: EstagioNegociacao }
  /** Soltar em "Encerrados" não diz QUAL encerramento — a UI pergunta entre estas opções. */
  | { acao: "encerrar"; opcoes: OpcaoEncerramento[] };

/**
 * O que acontece quando `card` é solto em `destino`.
 *
 * A costura (ADR-0004): um lead só atravessa para a negociação por **Levantamento**, e isso é a
 * qualificação de verdade — nunca troca de rótulo. Negociação nunca volta para a prospecção. As
 * regras da jornada de negociação (`transicaoPermitida`) são reaproveitadas, não duplicadas; o
 * servidor continua sendo a garantia — isto aqui só evita o arrasto otimista que vai ser recusado.
 */
export function decidirSoltura(card: CardRef, destino: ColunaFunil): Soltura {
  const origem = colunaDoCard(card);
  if (origem === destino) return { acao: "nada" };

  if (card.tipo === "LEAD") {
    if (incluso(COLUNAS_FUNIL_LEAD, destino)) return { acao: "mover-lead", para: destino };
    if (destino === "LEVANTAMENTO") {
      return { acao: "qualificar", reativa: !podeQualificar(card.status), statusAtual: card.status };
    }
    if (destino === "ENCERRADOS") {
      return {
        acao: "encerrar",
        opcoes: ENCERRADOS_LEAD.filter((s) => s !== card.status).map((para) => ({
          tipo: "LEAD" as const,
          para,
          label: STATUS_PROSPECCAO_LABEL[para],
        })),
      };
    }
    return {
      acao: "recusar",
      mensagem: "Uma prospecção entra na negociação por Levantamento — solte o card lá.",
    };
  }

  if (incluso(COLUNAS_FUNIL_LEAD, destino)) {
    return {
      acao: "recusar",
      mensagem: "Esta negociação já saiu da prospecção — mova-a entre os estágios de negociação.",
    };
  }
  if (destino === "ENCERRADOS") {
    const opcoes = ENCERRADOS_NEGOCIACAO.filter((e) => transicaoPermitida(card.estagio, e)).map(
      (para) => ({ tipo: "NEGOCIACAO" as const, para, label: ESTAGIO_LABEL[para] }),
    );
    if (opcoes.length === 0) {
      return {
        acao: "recusar",
        mensagem: `Negociação em "${ESTAGIO_LABEL[card.estagio]}" não pode ser encerrada.`,
      };
    }
    return { acao: "encerrar", opcoes };
  }
  return { acao: "mover-negociacao", para: destino };
}
