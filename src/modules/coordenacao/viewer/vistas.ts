/**
 * Coordenação BIM — vistas padrão do visualizador (superior, frontal, laterais…),
 * PURO: direção da câmera em espaço IFC (Z para cima) e posição que enquadra uma
 * esfera. Sem three — o engine converte para o espaço three e anima a câmera.
 *
 * Convenção: "frontal" olha a fachada voltada para o Y negativo do IFC (a câmera
 * fica no −Y olhando para +Y); a superior mantém o +Y do IFC no topo da tela.
 */
import { ifcParaThree, type Vec3 } from "@/modules/coordenacao/viewer/coords";

export type VistaPadrao = "superior" | "frontal" | "direita" | "esquerda" | "posterior" | "inferior" | "isometrica";

/** Ordem do menu = tecla de atalho (1 a 7). */
export const VISTAS_PADRAO: readonly { id: VistaPadrao; rotulo: string; atalho: string }[] = [
  { id: "superior", rotulo: "Superior (planta)", atalho: "1" },
  { id: "frontal", rotulo: "Frontal", atalho: "2" },
  { id: "direita", rotulo: "Lateral direita", atalho: "3" },
  { id: "esquerda", rotulo: "Lateral esquerda", atalho: "4" },
  { id: "posterior", rotulo: "Posterior", atalho: "5" },
  { id: "inferior", rotulo: "Inferior", atalho: "6" },
  { id: "isometrica", rotulo: "Isométrica", atalho: "7" },
];

/**
 * Inclinação mínima das vistas de cima/baixo: olhar exatamente na vertical deixa a
 * câmera (que gira em torno do eixo vertical) sem referência de "para cima" na tela.
 */
const QUASE_VERTICAL = 1e-3;

/** Do alvo para a câmera, em espaço IFC, normalizado. */
export function direcaoDaVista(vista: VistaPadrao): Vec3 {
  const bruto: Record<VistaPadrao, Vec3> = {
    superior: [0, -QUASE_VERTICAL, 1],
    inferior: [0, -QUASE_VERTICAL, -1],
    frontal: [0, -1, 0],
    posterior: [0, 1, 0],
    direita: [1, 0, 0],
    esquerda: [-1, 0, 0],
    isometrica: [1, -1, 1],
  };
  const [x, y, z] = bruto[vista];
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
}

/**
 * Câmera (espaço three) que enquadra a esfera `centro`/`raio` (espaço three) vista
 * de `vista`, com folga de 10%. `fovGraus` é o campo de visão vertical da câmera.
 */
export function cameraDaVista(
  vista: VistaPadrao,
  centro: Vec3,
  raio: number,
  fovGraus: number,
): { posicao: Vec3; alvo: Vec3 } {
  const meioFov = ((fovGraus > 0 ? fovGraus : 60) * Math.PI) / 360;
  const distancia = (Math.max(raio, 0.5) / Math.sin(meioFov)) * 1.1;
  const [dx, dy, dz] = ifcParaThree(direcaoDaVista(vista));
  return {
    posicao: [centro[0] + dx * distancia, centro[1] + dy * distancia, centro[2] + dz * distancia],
    alvo: [centro[0], centro[1], centro[2]],
  };
}

/**
 * Câmera (espaço three) que enquadra a CAIXA `min`/`max` (espaço three) vista de
 * `vista`, com folga de 5%: projeta os 8 cantos nos eixos da tela e afasta a câmera o
 * mínimo para todos caberem na largura e na altura. Mais justa que a esfera — numa
 * vista frontal de um prédio comprido, a esfera deixava o modelo pequeno no meio.
 */
export function cameraDaVistaParaCaixa(
  vista: VistaPadrao,
  min: Vec3,
  max: Vec3,
  fovGraus: number,
  aspecto: number,
): { posicao: Vec3; alvo: Vec3 } {
  const centro: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const d = ifcParaThree(direcaoDaVista(vista)); // do alvo para a câmera
  const frente: Vec3 = [-d[0], -d[1], -d[2]];
  const cruz = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (v: Vec3): Vec3 => {
    const n = Math.hypot(...v) || 1;
    return [v[0] / n, v[1] / n, v[2] / n];
  };
  const direita = norm(cruz(frente, [0, 1, 0]));
  const cima = cruz(direita, frente);
  const tanV = Math.tan((((fovGraus > 0 ? fovGraus : 60) * Math.PI) / 180) / 2);
  const tanH = tanV * (aspecto > 0 ? aspecto : 1);
  const ponto = (v: Vec3, e: Vec3) => v[0] * e[0] + v[1] * e[1] + v[2] * e[2];
  let distancia = 0.5;
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const rel: Vec3 = [x - centro[0], y - centro[1], z - centro[2]];
        const profundidade = ponto(rel, d);
        distancia = Math.max(
          distancia,
          profundidade + Math.abs(ponto(rel, direita)) / tanH,
          profundidade + Math.abs(ponto(rel, cima)) / tanV,
        );
      }
    }
  }
  distancia *= 1.05;
  return {
    posicao: [centro[0] + d[0] * distancia, centro[1] + d[1] * distancia, centro[2] + d[2] * distancia],
    alvo: centro,
  };
}

/** Tecla 1–7 → vista (null para qualquer outra). */
export function vistaDaTecla(tecla: string): VistaPadrao | null {
  return VISTAS_PADRAO.find((v) => v.atalho === tecla)?.id ?? null;
}

/** Letra clicada no indicador de eixos → vista olhando daquele lado. */
export function vistaDoEixo(letra: string): VistaPadrao | null {
  if (letra === "X") return "direita";
  if (letra === "Y") return "posterior";
  if (letra === "Z") return "superior";
  return null;
}

/**
 * O atalho de teclado só vale fora de campos de digitação e sem tecla modificadora —
 * "1" num campo de tolerância não pode girar a câmera.
 */
export function atalhoDeVistaPermitido(evento: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  alvoEditavel: boolean;
}): VistaPadrao | null {
  if (evento.ctrlKey || evento.metaKey || evento.altKey || evento.alvoEditavel) return null;
  return vistaDaTecla(evento.key);
}
