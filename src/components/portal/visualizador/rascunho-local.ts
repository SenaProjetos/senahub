import type { MarcacaoEntrada } from "@/modules/projetos/pendencias/marcacao-schema";

/**
 * Rascunho do pedido de revisão no NAVEGADOR (por conta e upload): perder a aba não perde as marcações, e duas contas
 * do portal no mesmo navegador não dividem o rascunho. Nada vai ao servidor
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

export function chaveDoRascunho(uploadId: string, userId: string): string {
  return `pedido-revisao:${userId}:${uploadId}`;
}

const numero = (v: unknown) => typeof v === "number" && Number.isFinite(v);

function marcacaoValida(m: unknown): m is MarcacaoRascunho {
  const x = m as Partial<MarcacaoRascunho> | null;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.texto === "string" &&
    numero(x.pagina) &&
    numero(x.x) &&
    numero(x.y) &&
    (x.marcacao === null || (typeof x.marcacao === "object" && typeof x.marcacao?.tipo === "string"))
  );
}

function armazenamento(s?: Storage): Storage | null {
  if (s) return s;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function lerRascunho(chave: string, s?: Storage): RascunhoPedido | null {
  try {
    const bruto = armazenamento(s)?.getItem(chave);
    if (!bruto) return null;
    const v = JSON.parse(bruto) as unknown;
    const r = v as Partial<RascunhoPedido>;
    if (typeof r?.comentario !== "string" || !Array.isArray(r.marcacoes)) return null;
    // Marcação de formato antigo ou estragado fica de fora (o servidor recusaria o pedido inteiro por ela).
    return { comentario: r.comentario, marcacoes: r.marcacoes.filter(marcacaoValida) };
  } catch {
    return null;
  }
}

/** Rascunho vazio (sem comentário e sem marcação) apaga o que havia. */
export function gravarRascunho(chave: string, r: RascunhoPedido, s?: Storage): void {
  try {
    const st = armazenamento(s);
    if (!st) return;
    if (!r.comentario.trim() && r.marcacoes.length === 0) st.removeItem(chave);
    else st.setItem(chave, JSON.stringify(r));
  } catch {
    /* sem armazenamento: o rascunho só não sobrevive à aba */
  }
}

export function limparRascunho(chave: string, s?: Storage): void {
  try {
    armazenamento(s)?.removeItem(chave);
  } catch {
    /* idem */
  }
}

// ─────────────────────────────────────────────────────────────
// Pedido no modelo 3D: rascunho por conta e PROJETO (o pedido cruza os modelos do projeto)
// ─────────────────────────────────────────────────────────────

type Vetor3 = [number, number, number];

/** Marcação 3D em edição. A imagem da vista NÃO vai para o armazenamento (fica só na memória da aba). */
export type MarcacaoModeloRascunho = {
  id: string;
  modeloId: string;
  guids: string[];
  ponto: Vetor3;
  camera: { position: Vetor3; target: Vetor3 };
  texto: string;
};

export type RascunhoModelo = { comentario: string; marcacoes: MarcacaoModeloRascunho[] };

export function chaveDoRascunhoModelo(projetoId: string, userId: string): string {
  return `pedido-revisao-modelo:${userId}:${projetoId}`;
}

const vetor3 = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(numero);

function marcacaoModeloValida(m: unknown): m is MarcacaoModeloRascunho {
  const x = m as Partial<MarcacaoModeloRascunho> | null;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.texto === "string" &&
    typeof x.modeloId === "string" &&
    Array.isArray(x.guids) &&
    x.guids.every((g) => typeof g === "string") &&
    vetor3(x.ponto) &&
    !!x.camera &&
    vetor3(x.camera.position) &&
    vetor3(x.camera.target)
  );
}

export function lerRascunhoModelo(chave: string, s?: Storage): RascunhoModelo | null {
  try {
    const bruto = armazenamento(s)?.getItem(chave);
    if (!bruto) return null;
    const r = JSON.parse(bruto) as Partial<RascunhoModelo> | null;
    if (typeof r?.comentario !== "string" || !Array.isArray(r.marcacoes)) return null;
    return { comentario: r.comentario, marcacoes: r.marcacoes.filter(marcacaoModeloValida) };
  } catch {
    return null;
  }
}

export function gravarRascunhoModelo(chave: string, r: RascunhoModelo, s?: Storage): void {
  try {
    const st = armazenamento(s);
    if (!st) return;
    if (!r.comentario.trim() && r.marcacoes.length === 0) st.removeItem(chave);
    else st.setItem(chave, JSON.stringify(r));
  } catch {
    /* sem armazenamento: o rascunho só não sobrevive à aba */
  }
}
