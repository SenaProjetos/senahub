/**
 * LGPD do CRM: a única fonte da regra "posso abordar este contato?" (F1.10, T1).
 *
 * Puro — sem I/O. Existe para que a condição NÃO seja reescrita em cada query. Quando a regra
 * crescer (consentimento com prazo, base legal por finalidade, bloqueio por país), muda aqui e
 * vale em todo lugar; espalhada, sempre sobra um lugar que ninguém lembrou de atualizar — e o
 * modo de falha é mandar e-mail para quem pediu descadastro.
 *
 * Ver docs/crm/02-schema.md §7 e a decisão transversal T1 em 01-decisoes.md.
 */

/** O mínimo que a regra precisa. Aceita qualquer objeto com esses campos (o `ContatoCliente` do Prisma serve). */
export type ContatoAbordavel = {
  optOut: boolean;
  email?: string | null;
  telefone?: string | null;
};

/**
 * Se o contato pode entrar em lista de abordagem, campanha ou exportação de prospecção.
 *
 * Hoje a regra é só o opt-out. Ter e-mail/telefone NÃO faz parte dela: um contato sem e-mail
 * ainda pode ser abordado por telefone, LinkedIn ou pessoalmente — filtrar por canal é
 * responsabilidade de quem monta a lista, não desta função.
 */
export function podeAbordar(contato: ContatoAbordavel): boolean {
  return !contato.optOut;
}

/**
 * Filtro Prisma equivalente ao `podeAbordar`, para aplicar no banco em vez de em memória.
 *
 * Espelha a mesma regra: as duas precisam mudar juntas, e é por isso que moram lado a lado.
 * Use em toda query que monta lista de abordagem ou exportação de prospecção.
 */
export const WHERE_PODE_ABORDAR = { optOut: false } as const;

/**
 * Dados para registrar um descadastro. `optOutAt` recebe o instante do pedido — é a prova de
 * quando a pessoa pediu, e por isso o relógio é injetado (testável, e o chamador controla).
 */
export function registrarOptOut(agora: Date = new Date()): { optOut: true; optOutAt: Date } {
  return { optOut: true, optOutAt: agora };
}
