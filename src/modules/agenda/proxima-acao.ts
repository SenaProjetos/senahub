/**
 * Rótulos da Próxima Ação comercial (CRM F2.1b/F2.1a, ADR-17). `TipoProximaAcao` mora no
 * `Compromisso` — a agenda que já existia — e não numa tabela nova (ver `docs/crm/01-decisoes.md`
 * ADR-17). Este arquivo é o mapa de exibição, puro e client-safe; a UI da agenda o usa tanto para
 * o filtro (F2.1a) quanto, mais tarde, para o schema completo de Próxima Ação (F2.10).
 */
import type { TipoProximaAcao } from "@/generated/prisma/client";

export const TIPO_PROXIMA_ACAO_LABEL: Record<TipoProximaAcao, string> = {
  LIGACAO: "Ligação",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  LINKEDIN: "LinkedIn",
  REUNIAO: "Reunião",
  FOLLOW_UP: "Follow-up",
  COBRAR_DOCUMENTACAO: "Cobrar documentação",
  COBRAR_ARQUITETURA: "Cobrar arquitetura",
  ENVIAR_PROPOSTA: "Enviar proposta",
  REVISAR_PROPOSTA: "Revisar proposta",
  RETORNO_AO_CLIENTE: "Retorno ao cliente",
  OUTRO: "Outro",
};

/** `null`/`undefined` = compromisso de agenda comum (comportamento de hoje). */
export function ehAcaoComercial(tipo: TipoProximaAcao | null | undefined): boolean {
  return tipo != null;
}
