/**
 * Regras puras do zoom do visualizador de documentos (preview / gerados). Sem DOM: o componente
 * `doc-viewport.tsx` mede e aplica; aqui só ficam as contas, para poderem ser testadas.
 */

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 8;

/** Sensibilidade da roda: ~10% por "clique" de mouse (deltaY 100). Trackpad manda deltas menores. */
const SENSIBILIDADE_RODA = 0.001;

export type ModoZoom = "largura" | "pagina" | "livre";

export function limitarZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/**
 * Novo zoom após um movimento de roda (Ctrl+roda). Exponencial, como nos CADs: cada clique
 * multiplica pelo mesmo fator, então subir e descer voltam ao mesmo ponto. `deltaY > 0` afasta.
 */
export function zoomPelaRoda(atual: number, deltaY: number): number {
  return limitarZoom(atual * Math.exp(-deltaY * SENSIBILIDADE_RODA));
}

/** Passo dos botões +/−: 25% multiplicativo, arredondado para o zoom não acumular resíduo. */
export function zoomPorPasso(atual: number, direcao: 1 | -1): number {
  return limitarZoom(Math.round(atual * (direcao === 1 ? 1.25 : 0.8) * 1000) / 1000);
}

/**
 * Zoom que ajusta o conteúdo ao visor.
 * - `largura`: cabe na largura, sem ampliar além de 100% (documento pequeno não vira gigante).
 * - `pagina`: cabe inteiro (largura e altura) — a visão de "ver a folha toda" do CAD.
 * Visor ou conteúdo sem medida (ainda não renderizou) → 1, para não devolver NaN/0.
 */
export function zoomParaAjustar(
  modo: Exclude<ModoZoom, "livre">,
  visor: { largura: number; altura: number },
  conteudo: { largura: number; altura: number },
): number {
  if (visor.largura <= 0 || conteudo.largura <= 0) return 1;
  const porLargura = visor.largura / conteudo.largura;
  if (modo === "largura") return limitarZoom(Math.min(1, porLargura));
  if (visor.altura <= 0 || conteudo.altura <= 0) return limitarZoom(Math.min(1, porLargura));
  return limitarZoom(Math.min(porLargura, visor.altura / conteudo.altura, 1));
}

/**
 * Rolagem que mantém o ponto do documento sob o cursor parado ao trocar o zoom (zoom "no cursor").
 * `pontoNoConteudo` é a posição do cursor em coordenadas do documento (antes do zoom);
 * `cursorNoVisor` é onde o cursor está dentro do visor. Devolve o novo scroll (nunca negativo —
 * o navegador limita ao máximo por conta própria).
 */
export function rolagemParaAncora(pontoNoConteudo: number, zoom: number, cursorNoVisor: number): number {
  return Math.max(0, pontoNoConteudo * zoom - cursorNoVisor);
}
