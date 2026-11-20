import type { MarcacaoEntrada } from "@/modules/projetos/pendencias/marcacao-schema";

/**
 * Rascunho do pedido de revisão no NAVEGADOR (por upload): perder a aba não perde as marcações. Nada vai ao servidor
 * antes de "Enviar pedido". Todo acesso ao armazenamento é em try/catch — aba anônima, cota cheia ou site bloqueado
 * só desligam o rascunho, nunca a tela.
 */

export type MarcacaoRascunho = {
  /** Id local (só para a lista da tela). */
  id: string;
  pagina: number;
  x: number;
  y: number;
  texto: string;
  marcacao: MarcacaoEntrada | null;
  /** Dimensões da página em pontos — a cota é medida com elas no servidor. */
  paginaPt: { w: number; h: number } | null;
  /** Valor da cota só para exibir (o servidor recalcula). */
  medidaMm?: number | null;
};

export type RascunhoPedido = { comentario: string; marcacoes: MarcacaoRascunho[] };

export function chaveDoRascunho(uploadId: string): string {
  return `pedido-revisao:${uploadId}`;
}

function armazenamento(s?: Storage): Storage | null {
  if (s) return s;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function lerRascunho(uploadId: string, s?: Storage): RascunhoPedido | null {
  try {
    const bruto = armazenamento(s)?.getItem(chaveDoRascunho(uploadId));
    if (!bruto) return null;
    const v = JSON.parse(bruto) as unknown;
    const r = v as Partial<RascunhoPedido>;
    if (typeof r?.comentario !== "string" || !Array.isArray(r.marcacoes)) return null;
    return { comentario: r.comentario, marcacoes: r.marcacoes };
  } catch {
    return null;
  }
}

/** Rascunho vazio (sem comentário e sem marcação) apaga o que havia. */
export function gravarRascunho(uploadId: string, r: RascunhoPedido, s?: Storage): void {
  try {
    const st = armazenamento(s);
    if (!st) return;
    if (!r.comentario.trim() && r.marcacoes.length === 0) st.removeItem(chaveDoRascunho(uploadId));
    else st.setItem(chaveDoRascunho(uploadId), JSON.stringify(r));
  } catch {
    /* sem armazenamento: o rascunho só não sobrevive à aba */
  }
}

export function limparRascunho(uploadId: string, s?: Storage): void {
  try {
    armazenamento(s)?.removeItem(chaveDoRascunho(uploadId));
  } catch {
    /* idem */
  }
}
