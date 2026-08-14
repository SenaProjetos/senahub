/**
 * Rótulos pt-BR de todo enum do CRM (F1.4, decisão transversal T6 em docs/crm/01-decisoes.md).
 *
 * A convenção do projeto é: **identificador em código, rótulo em pt-BR centralizado aqui**.
 * Nenhuma tela deve escrever "Em negociação" à mão — importa daqui, senão o mesmo estado aparece
 * com três grafias diferentes em três telas (foi exatamente o que aconteceu com as disciplinas,
 * que hoje têm 24 grafias em produção).
 *
 * ⚠️ Os enums ainda NÃO existem em `prisma/schema.prisma` — chegam na F1.5. Por isso os tipos são
 * declarados aqui, e não importados de `@/generated/prisma/client`. Quando a migration entrar,
 * troque cada `type X` por `import type { X }` do client gerado: o `satisfies` abaixo passa a
 * acusar, em tempo de compilação, qualquer valor de enum que ficar sem rótulo.
 *
 * Puro: sem I/O, sem `server-only` — client component pode importar.
 */

import type { StatusComercial } from "@/modules/comercial/status";

export type StatusProspeccao =
  | "IDENTIFICADO"
  | "CONTATO_INICIADO"
  | "EM_CONTATO"
  | "QUALIFICADO"
  | "OPORTUNIDADE_CRIADA"
  | "SEM_OPORTUNIDADE"
  | "EM_ESPERA"
  | "DESCARTADO";

export type EstagioNegociacao =
  | "LEVANTAMENTO"
  | "ORCAMENTO"
  | "PROPOSTA_ENVIADA"
  | "NEGOCIACAO"
  | "CONTRATADO"
  | "PERDIDO"
  | "EM_ESPERA"
  | "CANCELADO";

export type Temperatura = "FRIO" | "MORNO" | "QUENTE";

export type StatusPropostaCrm = "rascunho" | "enviada" | "em_negociacao" | "aceita" | "recusada";

export type TipoAtividade =
  | "LIGACAO"
  | "WHATSAPP"
  | "EMAIL"
  | "LINKEDIN"
  | "REUNIAO"
  | "NOTA"
  | "ANEXO"
  | "SISTEMA";

export type TipoProximaAcao =
  | "LIGACAO"
  | "WHATSAPP"
  | "EMAIL"
  | "LINKEDIN"
  | "REUNIAO"
  | "FOLLOW_UP"
  | "COBRAR_DOCUMENTACAO"
  | "COBRAR_ARQUITETURA"
  | "ENVIAR_PROPOSTA"
  | "REVISAR_PROPOSTA"
  | "RETORNO_AO_CLIENTE"
  | "OUTRO";

export type TipoAncoraCompromisso = "LEAD" | "NEGOCIACAO" | "CLIENTE";

export type StatusRelacionamentoContato = "ATIVO" | "AFASTADO" | "SAIU_DA_EMPRESA";

export type BaseLegalLgpd = "LEGITIMO_INTERESSE";

// ── Rótulos ──────────────────────────────────────────────────────────────────
// `satisfies Record<T, string>` é o que garante exaustividade: falta um valor → erro de compilação.
// Usar `satisfies` em vez de anotação de tipo preserva as chaves literais para quem itera o objeto.

/** Status comercial da Empresa (ADR-08). `EX_CLIENTE`/`PARCEIRO` só via override manual. */
export const STATUS_COMERCIAL_LABEL = {
  PROSPECT: "Prospect",
  CLIENTE: "Cliente",
  EX_CLIENTE: "Ex-cliente",
  PARCEIRO: "Parceiro",
} satisfies Record<StatusComercial, string>;

/** Funil de prospecção (ADR-18: só os 4 primeiros travam a empresa para nova prospecção). */
export const STATUS_PROSPECCAO_LABEL = {
  IDENTIFICADO: "Identificado",
  CONTATO_INICIADO: "Contato iniciado",
  EM_CONTATO: "Em contato",
  QUALIFICADO: "Qualificado",
  OPORTUNIDADE_CRIADA: "Negociação criada",
  SEM_OPORTUNIDADE: "Sem oportunidade",
  EM_ESPERA: "Em espera",
  DESCARTADO: "Descartado",
} satisfies Record<StatusProspeccao, string>;

/** Funil de negociação. */
export const ESTAGIO_NEGOCIACAO_LABEL = {
  LEVANTAMENTO: "Levantamento",
  ORCAMENTO: "Orçamento",
  PROPOSTA_ENVIADA: "Proposta enviada",
  NEGOCIACAO: "Negociação",
  CONTRATADO: "Contratado",
  PERDIDO: "Perdido",
  EM_ESPERA: "Em espera",
  CANCELADO: "Cancelado",
} satisfies Record<EstagioNegociacao, string>;

export const TEMPERATURA_LABEL = {
  FRIO: "Frio",
  MORNO: "Morno",
  QUENTE: "Quente",
} satisfies Record<Temperatura, string>;

/** Inclui `em_negociacao`, que só entra no schema na Fase 5 (P14). */
export const STATUS_PROPOSTA_LABEL = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  em_negociacao: "Em negociação",
  aceita: "Aceita",
  recusada: "Recusada",
} satisfies Record<StatusPropostaCrm, string>;

/** Timeline. `SISTEMA` é o evento automático (mudança de etapa, criação…). */
export const TIPO_ATIVIDADE_LABEL = {
  LIGACAO: "Ligação",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  LINKEDIN: "LinkedIn",
  REUNIAO: "Reunião",
  NOTA: "Nota",
  ANEXO: "Anexo",
  SISTEMA: "Sistema",
} satisfies Record<TipoAtividade, string>;

/** Próxima ação (ADR-17: vive em `Compromisso`, não em tabela própria). */
export const TIPO_PROXIMA_ACAO_LABEL = {
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
} satisfies Record<TipoProximaAcao, string>;

/** A que registro um compromisso comercial está ancorado (ADR-17). */
export const TIPO_ANCORA_COMPROMISSO_LABEL = {
  LEAD: "Prospecção",
  NEGOCIACAO: "Negociação",
  CLIENTE: "Cliente",
} satisfies Record<TipoAncoraCompromisso, string>;

export const STATUS_RELACIONAMENTO_CONTATO_LABEL = {
  ATIVO: "Ativo",
  AFASTADO: "Afastado",
  SAIU_DA_EMPRESA: "Saiu da empresa",
} satisfies Record<StatusRelacionamentoContato, string>;

/** LGPD — base legal da coleta (T1). Prospecção B2B fria = legítimo interesse. */
export const BASE_LEGAL_LGPD_LABEL = {
  LEGITIMO_INTERESSE: "Legítimo interesse",
} satisfies Record<BaseLegalLgpd, string>;

/**
 * Monta as opções de um `<Select>` a partir de um mapa de rótulos, preservando a ordem de
 * declaração — que é a ordem do funil, não alfabética. Evita cada tela reimplementar o
 * `Object.entries().map()`.
 */
export function opcoesDe<T extends string>(mapa: Record<T, string>): { value: T; label: string }[] {
  return (Object.entries(mapa) as [T, string][]).map(([value, label]) => ({ value, label }));
}
