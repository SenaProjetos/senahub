/**
 * Status documental — cor da badge e o que o SISTEMA muda sozinho (reunião de 29/09/2026). PURO: sem
 * Prisma nem React, serve à tela e ao servidor.
 *
 * O catálogo (`DocumentoStatus`) é do escritório; o sistema só conhece os status pela `chave`. A automação
 * mexe em poucos pontos, e sempre para ANDAR o fluxo — nunca apaga um passo que alguém deu à mão:
 *
 * - **Revisão nova enviada → "Enviado".** Só no 1º arquivo da revisão vigente (o DWG que chega depois na
 *   mesma R02 não é revisão nova).
 * - **Prancha da revisão vigente validada → "Aprovado"**, se o documento ainda estava antes da aprovação
 *   (sem status, em elaboração, enviado, em análise, correção solicitada).
 * - **Validação desfeita → volta**: para "Enviado" (reverter) ou "Correção solicitada" (ajuste pedido /
 *   apontamentos enviados) — mas só se o status for o "Aprovado" que a validação pôs e não sobrar arquivo
 *   validado na revisão vigente.
 *
 * "Em análise", "Correção solicitada", "Aprovado com ressalvas" e o resto continuam manuais. Status final
 * (obsoleto/arquivado) nunca é tocado, e status sem chave (criado pelo escritório) também não.
 */

export const CHAVE_STATUS = {
  emElaboracao: "em_elaboracao",
  enviado: "enviado",
  emAnalise: "em_analise",
  correcaoSolicitada: "correcao_solicitada",
  aprovado: "aprovado",
  aprovadoRessalvas: "aprovado_ressalvas",
  compartilhado: "compartilhado",
  liberadoObra: "liberado_obra",
  obsoleto: "obsoleto",
  arquivado: "arquivado",
} as const;

export type ChaveStatus = (typeof CHAVE_STATUS)[keyof typeof CHAVE_STATUS];

/** O status atual do documento, como a regra precisa dele. `null` = documento sem status. */
export type StatusAtual = { chave: string | null; final: boolean } | null;

const ANTES_DA_APROVACAO: ReadonlySet<string> = new Set([
  CHAVE_STATUS.emElaboracao,
  CHAVE_STATUS.enviado,
  CHAVE_STATUS.emAnalise,
  CHAVE_STATUS.correcaoSolicitada,
]);

/** Revisão nova chegou. `primeiroArquivoDaRevisao` = a revisão não tinha arquivo antes deste envio. */
export function statusAoEnviarRevisao(p: {
  atual: StatusAtual;
  primeiroArquivoDaRevisao: boolean;
  revisaoVigente: boolean;
}): ChaveStatus | null {
  if (!p.primeiroArquivoDaRevisao || !p.revisaoVigente) return null;
  if (p.atual?.final) return null;
  if (p.atual?.chave === CHAVE_STATUS.enviado) return null;
  return CHAVE_STATUS.enviado;
}

/** Um arquivo do documento foi validado. */
export function statusAoAprovar(p: { atual: StatusAtual; revisaoVigente: boolean }): ChaveStatus | null {
  if (!p.revisaoVigente) return null;
  if (p.atual == null) return CHAVE_STATUS.aprovado;
  if (p.atual.final || p.atual.chave == null) return null;
  return ANTES_DA_APROVACAO.has(p.atual.chave) ? CHAVE_STATUS.aprovado : null;
}

/**
 * A validação de um arquivo foi desfeita. `motivo`: `reverter` (desfazer a validação) ou `correcao` (ajuste
 * solicitado / apontamentos enviados). Só desfaz o "Aprovado" que a validação pôs.
 */
export function statusAoDesaprovar(p: {
  atual: StatusAtual;
  revisaoVigente: boolean;
  aindaHaValidadoNaVigente: boolean;
  motivo: "reverter" | "correcao";
}): ChaveStatus | null {
  if (!p.revisaoVigente || p.aindaHaValidadoNaVigente) return null;
  if (p.atual?.chave !== CHAVE_STATUS.aprovado) return null;
  return p.motivo === "correcao" ? CHAVE_STATUS.correcaoSolicitada : CHAVE_STATUS.enviado;
}

// ─────────────────────────────────────────────────────────────
// Cor da badge
// ─────────────────────────────────────────────────────────────

/**
 * `DocumentoStatus.cor` guarda o nome de um token, e a classe sai daqui — escrita por inteiro para o
 * Tailwind enxergar. Cor desconhecida ou vazia cai no neutro.
 *
 * `info` e `primario` são PREENCHIDAS: são as cores dos dois status que o cliente vê (Compartilhado, Liberado
 * para obra), e o contorno delas se confundia — `info` tem o mesmo tom de `andamento` (Em análise), e o
 * `primary` do tema escuro é um cinza que parecia badge desabilitada (visto em tela, 29/09/2026).
 */
const CLASSE_DA_COR: Record<string, string> = {
  neutro: "border-border bg-muted text-muted-foreground",
  aguardando: "border-status-aguardando/40 bg-status-aguardando/10 text-status-aguardando",
  andamento: "border-status-andamento/40 bg-status-andamento/10 text-status-andamento",
  revisao: "border-status-revisao/40 bg-status-revisao/10 text-status-revisao",
  entregue: "border-status-entregue/40 bg-status-entregue/10 text-status-entregue",
  aprovado: "border-status-aprovado/40 bg-status-aprovado/10 text-status-aprovado",
  info: "border-info bg-info text-info-foreground",
  primario: "border-primary bg-primary text-primary-foreground",
  perigo: "border-destructive/40 bg-destructive/10 text-destructive",
};

export const CORES_STATUS = Object.keys(CLASSE_DA_COR);

export function classeDoStatus(cor: string | null | undefined): string {
  return (cor && CLASSE_DA_COR[cor]) || CLASSE_DA_COR.neutro;
}
