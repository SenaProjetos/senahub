import {
  MOTIVO_JA_RESPONDIDO,
  MOTIVO_PRANCHA_RETIRADA,
  MOTIVO_REVISAO_SUBSTITUIDA,
  situacaoDaRevisao,
  textoDoRascunho,
  type EstadoDaRevisao,
  type SituacaoDaRevisao,
  type StatusPedido,
} from "./regras";

/**
 * Regras puras do pedido de revisão no modelo 3D (spec 2026-11-20-portal-visualizador-3d-design.md, "Pedir revisão no
 * modelo"). O pedido de tipo `modelo` segue o fluxo da prancha (item 5); a diferença é que cada marcação aponta o seu
 * modelo, e a situação do pedido é a PIOR entre as das marcações.
 */

export const TIPOS_PEDIDO = ["prancha", "modelo"] as const;
export type TipoPedido = (typeof TIPOS_PEDIDO)[number];

/** Como um pedido de modelo aparece onde a prancha mostraria o nome do arquivo. */
export const ROTULO_MODELO_3D = "Modelo 3D";

/** Aceitar ou recusar um pedido de modelo exige `coordenacao:gerir` (quem cria apontamento 3D hoje). */
export const MOTIVO_SEM_COORDENACAO = "Só quem gerencia a coordenação 3D responde pedidos no modelo: as marcações viram apontamentos 3D.";

/** IfcGuids por marcação (o mesmo teto do apontamento 3D da coordenação). */
export const MAX_GUIDS_MARCACAO = 200;
/** Título do `ApontamentoCoordenacao` (o schema da coordenação aceita até 200). */
export const LIMITE_TITULO_APONTAMENTO = 200;

export function tipoDoPedido(tipo: string): TipoPedido {
  return tipo === "modelo" ? "modelo" : "prancha";
}

/** Título do apontamento que a marcação vira: o começo do texto, numa linha só, até 200 caracteres. */
export function tituloDoApontamento(texto: string): string {
  const linha = texto.replace(/\s+/g, " ").trim();
  if (!linha) return ROTULO_MODELO_3D;
  if (linha.length <= LIMITE_TITULO_APONTAMENTO) return linha;
  return `${linha.slice(0, LIMITE_TITULO_APONTAMENTO - 1)}…`;
}

/**
 * Onde está o modelo de uma marcação: o das Entregas segue a regra da revisão da prancha (pela revisão do IFC das
 * Entregas de que o modelo saiu); o recebido do cliente só sai se o documento foi excluído (versão nova não bloqueia).
 */
export function situacaoDaMarcacao(
  m: { origem: "entrega"; revisao: EstadoDaRevisao } | { origem: "cliente"; documentoExiste: boolean },
): SituacaoDaRevisao {
  if (m.origem === "cliente") return m.documentoExiste ? "nas_entregas" : "retirada";
  return situacaoDaRevisao(m.revisao);
}

const PESO: Record<SituacaoDaRevisao, number> = { nas_entregas: 0, retirada: 1, substituida: 2 };

/** A pior situação entre as marcações (substituída > retirada > nas Entregas); sem marcações = nas Entregas. */
export function piorSituacao(situacoes: readonly SituacaoDaRevisao[]): SituacaoDaRevisao {
  return situacoes.reduce<SituacaoDaRevisao>((pior, s) => (PESO[s] > PESO[pior] ? s : pior), "nas_entregas");
}

/** As mesmas frases do item 5; a pior situação manda, e o pedido sem marcações nunca bloqueia. */
export function motivoParaNaoAceitarModelo(p: { status: StatusPedido; situacoes: readonly SituacaoDaRevisao[] }): string | null {
  if (p.status !== "aguardando") return MOTIVO_JA_RESPONDIDO;
  const pior = piorSituacao(p.situacoes);
  if (pior === "substituida") return MOTIVO_REVISAO_SUBSTITUIDA;
  if (pior === "retirada") return MOTIVO_PRANCHA_RETIRADA;
  return null;
}

type Vetor3 = [number, number, number];

function vetor3(v: unknown): Vetor3 | null {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? (v as Vetor3) : null;
}

/** Câmera gravada na marcação ({ position, target }, espaço IFC); ilegível = null. */
export function lerCamera(v: unknown): { position: Vetor3; target: Vetor3 } | null {
  if (!v || typeof v !== "object") return null;
  const c = v as { position?: unknown; target?: unknown };
  const position = vetor3(c.position);
  const target = vetor3(c.target);
  return position && target ? { position, target } : null;
}

/** IfcGuids gravados na marcação (só as strings; o resto é descartado). */
export function lerGuids(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((g): g is string => typeof g === "string" && g.length > 0).slice(0, MAX_GUIDS_MARCACAO) : [];
}

/**
 * O que o apontamento 3D da coordenação recebe de uma marcação do cliente: o modelo que o cliente viu, os elementos e
 * a vista dele, o título (começo do texto) e o texto "Cliente (Nome): …" — o mesmo do rascunho da prancha. Câmera
 * ilegível vira uma vista neutra (a marcação nunca trava o aceite).
 */
export function apontamentoDaMarcacao(
  m: { modeloId: string; texto: string; guids: unknown; camera: unknown },
  ctx: { nomeAutor: string; temAnexos: boolean },
) {
  return {
    uploadId: m.modeloId,
    titulo: tituloDoApontamento(m.texto),
    texto: textoDoRascunho({ nomeAutor: ctx.nomeAutor, texto: m.texto, temAnexos: ctx.temAnexos }),
    guids: lerGuids(m.guids),
    camera: lerCamera(m.camera) ?? { position: [0, 0, 0] as Vetor3, target: [0, 0, 0] as Vetor3 },
  };
}
