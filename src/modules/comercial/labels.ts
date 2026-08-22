/**
 * Rótulos pt-BR de todo enum do CRM (F1.4, decisão transversal T6 em docs/crm/01-decisoes.md).
 *
 * A convenção do projeto é: **identificador em código, rótulo em pt-BR centralizado aqui**.
 * Nenhuma tela deve escrever "Em negociação" à mão — importa daqui, senão o mesmo estado aparece
 * com três grafias diferentes em três telas (foi exatamente o que aconteceu com as disciplinas,
 * que hoje têm 24 grafias em produção).
 *
 * ✅ Religado na F1.5 (2026-08-14): os enums agora existem no `schema.prisma`, então os tipos vêm
 * do client gerado. O `satisfies` abaixo passa a validar contra a FONTE REAL — adicionar um valor
 * ao enum no Prisma sem dar rótulo aqui quebra a compilação, que é exatamente o que se quer.
 *
 * ✅ `StatusProposta` religado na F5.5 (2026-08-22): `em_negociacao` entrou no enum real do
 * Prisma (P14 item 4) — o tipo local `StatusPropostaCrm` que o antecipava foi removido; usa-se
 * `StatusProposta` importado abaixo, como os demais.
 *
 * Ainda declarados localmente (não existem no Prisma):
 *   - `TipoProximaAcao` / `TipoAncoraCompromisso` — chegam na F2.1b (`Compromisso` v2, ADR-17)
 *
 * Puro: sem I/O, sem `server-only` — client component pode importar (o client Prisma exporta os
 * enums como valores/tipos, sem puxar o runtime de banco quando importados com `import type`).
 */

import type {
  StatusProspeccao,
  EstagioNegociacao,
  Temperatura,
  TipoAtividade,
  StatusComercialCliente,
  BaseLegalLgpd,
  StatusRelacionamentoContato,
  StatusProposta,
} from "@/generated/prisma/enums";

export type {
  StatusProspeccao,
  EstagioNegociacao,
  Temperatura,
  TipoAtividade,
  StatusComercialCliente,
  BaseLegalLgpd,
  StatusRelacionamentoContato,
  StatusProposta,
};

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

// ── Rótulos ──────────────────────────────────────────────────────────────────
// `satisfies Record<T, string>` é o que garante exaustividade: falta um valor → erro de compilação.
// Usar `satisfies` em vez de anotação de tipo preserva as chaves literais para quem itera o objeto.

/** Status comercial da Empresa (ADR-08). `EX_CLIENTE`/`PARCEIRO` só via override manual. */
export const STATUS_COMERCIAL_LABEL = {
  PROSPECT: "Prospect",
  CLIENTE: "Cliente",
  EX_CLIENTE: "Ex-cliente",
  PARCEIRO: "Parceiro",
} satisfies Record<StatusComercialCliente, string>;

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

export const STATUS_PROPOSTA_LABEL = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  em_negociacao: "Em negociação",
  aceita: "Aceita",
  recusada: "Recusada",
} satisfies Record<StatusProposta, string>;

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
