/**
 * Coordenação BIM — mover a prévia do realinhamento pelo teclado (puro).
 *
 * Setas andam em planta RELATIVAS À TELA (→ leva o modelo para a direita de quem olha,
 * ↑ para longe), PageUp/PageDown sobem/descem, Q/E giram (anti-horário/horário visto
 * de cima). Passo 10 cm / 1°; com Shift 1 m / 10°; com Alt 1 cm / 0,1°.
 */
import type { Vec3 } from "@/modules/coordenacao/viewer/coords";

export type DirecoesDeTela = {
  /** Direção em planta (IFC x, y), unitária, que aparece como "direita" na tela. */
  direita: [number, number];
  /** Direção em planta que aparece como "para cima/para longe" na tela. */
  afastar: [number, number];
};

export const PASSO_METROS = 0.1;
export const PASSO_GRAUS = 1;

/** Abaixo desta parte horizontal da direção da câmera, ela conta como vertical. */
const LIMIAR_QUASE_VERTICAL = 0.3;

function unitario(x: number, y: number): [number, number] | null {
  const n = Math.hypot(x, y);
  return n < 1e-6 ? null : [x / n, y / n];
}

/**
 * Eixos da tela levados para a planta. `frente` e `cima` são os eixos da câmera em
 * espaço IFC. Olhando de cima, a frente é vertical e não serve: aí "para longe" é o
 * "cima" da câmera projetado.
 */
export function direcoesDeTela(frente: Vec3, cima: Vec3): DirecoesDeTela {
  // Câmera quase na vertical (vista superior): a parte horizontal da frente é só ruído
  // e gira as setas; vale o "cima" da câmera.
  const quaseVertical = Math.hypot(frente[0], frente[1]) < LIMIAR_QUASE_VERTICAL;
  const afastar =
    (quaseVertical ? null : unitario(frente[0], frente[1])) ?? unitario(cima[0], cima[1]) ?? [0, 1];
  // Direita = afastar girado −90° em planta (visto de cima, Z para cima).
  return { afastar, direita: [afastar[1], -afastar[0]] };
}

export type PassoTeclado = { delta: Vec3; graus: number };

/** Tecla → passo na prévia, ou null se a tecla não move o modelo. */
export function passoDoTeclado(
  evento: { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean },
  direcoes: DirecoesDeTela,
): PassoTeclado | null {
  if (evento.ctrlKey || evento.metaKey) return null;
  const fator = evento.shiftKey ? 10 : evento.altKey ? 0.1 : 1;
  const m = PASSO_METROS * fator;
  const plano = (d: [number, number], sinal: number): PassoTeclado => ({
    delta: [d[0] * m * sinal + 0, d[1] * m * sinal + 0, 0],
    graus: 0,
  });
  switch (evento.key) {
    case "ArrowRight":
      return plano(direcoes.direita, 1);
    case "ArrowLeft":
      return plano(direcoes.direita, -1);
    case "ArrowUp":
      return plano(direcoes.afastar, 1);
    case "ArrowDown":
      return plano(direcoes.afastar, -1);
    case "PageUp":
      return { delta: [0, 0, m], graus: 0 };
    case "PageDown":
      return { delta: [0, 0, -m], graus: 0 };
  }
  const tecla = evento.key.toLowerCase();
  if (tecla === "q") return { delta: [0, 0, 0], graus: PASSO_GRAUS * fator };
  if (tecla === "e") return { delta: [0, 0, 0], graus: -PASSO_GRAUS * fator };
  return null;
}
