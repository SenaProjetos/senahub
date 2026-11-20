import {
  MOTIVO_JA_RESPONDIDO,
  MOTIVO_PRANCHA_RETIRADA,
  MOTIVO_REVISAO_SUBSTITUIDA,
  MOTIVO_SEM_VALIDAR,
  assinaturaConfere,
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

/** As frases do item 5, com o modelo no lugar da prancha (a marcação aponta um modelo das Entregas ou do cliente). */
export const MOTIVO_MODELO_SUBSTITUIDO =
  "Um modelo deste pedido ganhou revisão nova depois do pedido. Recuse com uma resposta e peça ao cliente que confira a revisão nova.";
export const MOTIVO_MODELO_RETIRADO =
  "Um modelo deste pedido saiu das Entregas do cliente. Recuse com uma resposta explicando ao cliente.";

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
  if (pior === "substituida") return MOTIVO_MODELO_SUBSTITUIDO;
  if (pior === "retirada") return MOTIVO_MODELO_RETIRADO;
  return null;
}

type Indisponivel = "substituida" | "retirada";

/**
 * O motivo para não aceitar que a TELA já sabe (o servidor confere tudo de novo): na prancha, `uploads:validar` (os
 * rascunhos de apontamento ficam com quem aceita); no modelo, `coordenacao:gerir` (as marcações viram apontamentos 3D).
 */
export function motivoNaTelaDoPedido(
  p: { tipo: TipoPedido; indisponivel: Indisponivel | null },
  poderes: { podeValidar: boolean; podeCoordenar: boolean },
): string | null {
  if (p.tipo === "modelo") {
    if (!poderes.podeCoordenar) return MOTIVO_SEM_COORDENACAO;
    if (p.indisponivel === "substituida") return MOTIVO_MODELO_SUBSTITUIDO;
    if (p.indisponivel === "retirada") return MOTIVO_MODELO_RETIRADO;
    return null;
  }
  if (!poderes.podeValidar) return MOTIVO_SEM_VALIDAR;
  if (p.indisponivel === "substituida") return MOTIVO_REVISAO_SUBSTITUIDA;
  if (p.indisponivel === "retirada") return MOTIVO_PRANCHA_RETIRADA;
  return null;
}

/** Como o pedido aparece na fila e no portal: a prancha pelo nome; o modelo como "Modelo 3D · N marcações". */
export function rotuloDoPedido(p: { tipo: TipoPedido; prancha: string; marcacoes: number }): string {
  if (p.tipo !== "modelo") return p.prancha;
  if (p.marcacoes === 0) return ROTULO_MODELO_3D;
  return `${ROTULO_MODELO_3D} · ${p.marcacoes} ${p.marcacoes === 1 ? "marcação" : "marcações"}`;
}

/** O selo do pedido que não pode mais ser aceito. */
export function rotuloIndisponivel(tipo: TipoPedido, s: Indisponivel): string {
  if (tipo === "modelo") return s === "substituida" ? "Modelo substituído" : "Modelo retirado";
  return s === "substituida" ? "Revisão substituída" : "Prancha retirada";
}

/** O que o cliente lê no card do portal quando o pedido não pode mais ser aceito. */
export function avisoIndisponivelNoPortal(tipo: TipoPedido, s: Indisponivel): string {
  if (tipo === "modelo") {
    return s === "substituida"
      ? "Um modelo deste pedido ganhou revisão nova. Confira a revisão nova no Modelo 3D."
      : "Um modelo deste pedido saiu das suas Entregas. A equipe vai responder o pedido.";
  }
  return s === "substituida"
    ? "A prancha ganhou revisão nova depois deste pedido. Confira a revisão nova nas Entregas."
    : "Esta prancha saiu das suas Entregas. A equipe vai responder o pedido.";
}

// ─────────────────────────────────────────────────────────────
// Imagem da vista (rota /api/portal/pedidos/[id]/marcacoes/[marcacaoId]/imagem)
// ─────────────────────────────────────────────────────────────

/** Teto da imagem da vista: o mesmo do snapshot do apontamento da coordenação. */
export const TAMANHO_MAX_IMAGEM_VISTA = 2 * 1024 * 1024;
export const MOTIVO_IMAGEM_GRANDE = "A imagem da vista passa de 2 MB.";
export const MOTIVO_IMAGEM_NAO_PNG = "A imagem da vista precisa ser PNG.";
export const MOTIVO_IMAGEM_SO_AUTOR = "Só quem fez o pedido envia a imagem da vista, e só enquanto ele aguarda a equipe.";

/** PNG (pela assinatura, não pelo nome) de até 2 MB; null = entra. */
export function motivoDaImagemDaVista(p: { tamanho: number; inicio: Uint8Array }): string | null {
  if (p.tamanho > TAMANHO_MAX_IMAGEM_VISTA) return MOTIVO_IMAGEM_GRANDE;
  if (p.tamanho <= 0 || !assinaturaConfere("png", p.inicio)) return MOTIVO_IMAGEM_NAO_PNG;
  return null;
}

type Vetor3 = [number, number, number];

function vetor3(v: unknown): Vetor3 | null {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? (v as Vetor3) : null;
}

/** Câmera gravada na marcação ({ position, target }, eixos IFC no referencial do próprio modelo); ilegível = null. */
export function lerCamera(v: unknown): { position: Vetor3; target: Vetor3 } | null {
  if (!v || typeof v !== "object") return null;
  const c = v as { position?: unknown; target?: unknown };
  const position = vetor3(c.position);
  const target = vetor3(c.target);
  return position && target ? { position, target } : null;
}

/** Ponto 3D gravado na marcação (eixos IFC no referencial do próprio modelo); ilegível = null. */
export function lerPonto(v: unknown): Vetor3 | null {
  return vetor3(v);
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

/** Marcação 3D já enviada, para desenhar no visualizador (leitura) e para "ir para" a vista dela. */
export type MarcaModeloLeitura = {
  id: string;
  numero: number;
  modeloId: string;
  texto: string;
  guids: string[];
  /**
   * Onde o cliente clicou: eixos IFC, no referencial do PRÓPRIO modelo (como se ele tivesse aberto primeiro — o mundo
   * do visualizador é o do 1º modelo aberto). A tela soma o deslocamento do modelo (`pontoNaCena`). Null = sem alfinete.
   */
  ponto: Vetor3 | null;
  /** A vista do cliente, no mesmo referencial do `ponto` (`vistaNaCena` para restaurar); null = sem "ir para". */
  camera: { position: Vetor3; target: Vetor3 } | null;
};

export function marcaModeloDeLeitura(
  m: { id: string; modeloId: string; texto: string; guids: unknown; ponto: unknown; camera: unknown },
  numero: number,
): MarcaModeloLeitura {
  return {
    id: m.id,
    numero,
    modeloId: m.modeloId,
    texto: m.texto,
    guids: lerGuids(m.guids),
    ponto: lerPonto(m.ponto),
    camera: lerCamera(m.camera),
  };
}
