/**
 * Vocabulário do ciclo de vida da revisão (ISO 19650). PURO, client-safe: tela, serviço, job e
 * script de migração leem as mesmas definições.
 *
 * Três camadas independentes (decisão do dono, 2026-10-08):
 *  1. ESTADO — um por revisão, sempre presente: em andamento → em análise → publicado → arquivado.
 *  2. CONTROLES — coexistem com o estado (`ControleRevisao`): liberado para obra, enviado ao cliente,
 *     bloqueio e restrição. Remover um controle é registrar a remoção, nunca apagar.
 *  3. EVENTOS — o histórico do documento (`DocumentoEvento`), com a revisão em `revisaoId`.
 *
 * O estado ISO "Shared" aparece na tela como **"Em análise"**: no SenaHub "Compartilhado" sempre quis
 * dizer "mandado ao cliente", e isso agora é o controle "Enviado ao cliente" (D1-c). Mesmo estado,
 * nome que não confunde quem já usa o sistema.
 */

export const ESTADOS_REVISAO = ["em_andamento", "compartilhado", "publicado", "arquivado"] as const;
export type EstadoRevisao = (typeof ESTADOS_REVISAO)[number];

export const ROTULO_ESTADO: Record<EstadoRevisao, string> = {
  em_andamento: "Em andamento",
  compartilhado: "Em análise",
  publicado: "Publicado",
  arquivado: "Arquivado",
};

/** O termo da ISO 19650, para a dica do selo. */
export const ESTADO_ISO: Record<EstadoRevisao, string> = {
  em_andamento: "Work in progress (WIP)",
  compartilhado: "Shared",
  publicado: "Published",
  arquivado: "Archived",
};

/** Token de cor do design system (`classeDoStatus` em status-documento.ts). */
export const COR_ESTADO: Record<EstadoRevisao, string> = {
  em_andamento: "neutro",
  compartilhado: "andamento",
  publicado: "aprovado",
  arquivado: "aguardando",
};

/** Publicado e arquivado são somente leitura: nada entra, nada sai, nada se exclui (I2, I3, I6). */
export function estadoCongelado(estado: EstadoRevisao): boolean {
  return estado === "publicado" || estado === "arquivado";
}

export const TIPOS_CONTROLE = ["liberado_obra", "enviado_cliente", "bloqueio", "restricao"] as const;
export type TipoControle = (typeof TIPOS_CONTROLE)[number];

export const ROTULO_CONTROLE: Record<TipoControle, string> = {
  liberado_obra: "Liberado para obra",
  enviado_cliente: "Enviado ao cliente",
  bloqueio: "Bloqueado",
  restricao: "Com restrição",
};

export const COR_CONTROLE: Record<TipoControle, string> = {
  liberado_obra: "primario",
  enviado_cliente: "info",
  bloqueio: "perigo",
  restricao: "revisao",
};

/** Controles que levam a revisão a uma pasta do cliente — só existem em revisão publicada (I5, D1-c). */
export const CONTROLES_DE_PASTA: readonly TipoControle[] = ["liberado_obra", "enviado_cliente"];

export const ESCOPOS_BLOQUEIO = ["download", "atualizacao", "exclusao"] as const;
export type EscopoBloqueio = (typeof ESCOPOS_BLOQUEIO)[number];

export const ROTULO_ESCOPO: Record<EscopoBloqueio, string> = {
  download: "download",
  atualizacao: "atualização",
  exclusao: "exclusão",
};

/** R00 · v3 — a versão é interna; para o cliente sai só a revisão. */
export function rotuloRevisaoVersao(rotuloRevisao: string, versao: number): string {
  return `${rotuloRevisao} · v${versao}`;
}
