/**
 * Coordenação BIM — escolha do ponto de snap (puro): vértice, PONTO MÉDIO de aresta
 * ou ponto sobre a aresta. O fragments devolve o acerto e, quando é aresta, os dois
 * extremos dela; aqui se decide se o cursor está perto o bastante do meio da aresta
 * (em pixels de tela) para grudar nele — como o "midpoint" do AutoCAD.
 */
import type { Vec3 } from "@/modules/coordenacao/viewer/coords";

export type TipoSnap = "vertice" | "meio" | "aresta";

export type AcertoSnap = {
  ponto: Vec3;
  /** Classe do fragments: 0 = vértice, 1 = aresta, 2 = face. */
  classe: number;
  aresta?: { p1: Vec3; p2: Vec3 };
};

/** Raio, em pixels, em que o cursor gruda no meio da aresta. */
export const RAIO_MEIO_PX = 12;

/**
 * Ponto final do snap. `naTela` projeta um ponto 3D para pixels; `cursor` é a
 * posição do mouse. Vértice ganha sempre; numa aresta, o meio ganha quando está a
 * até `raioPx` do cursor; senão fica o ponto sobre a aresta.
 */
export function escolherSnap(
  acerto: AcertoSnap,
  naTela: (p: Vec3) => [number, number],
  cursor: [number, number],
  raioPx = RAIO_MEIO_PX,
): { ponto: Vec3; tipo: TipoSnap } {
  if (acerto.classe === 0) return { ponto: acerto.ponto, tipo: "vertice" };
  if (acerto.aresta) {
    const { p1, p2 } = acerto.aresta;
    const meio: Vec3 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2];
    const [mx, my] = naTela(meio);
    if (Math.hypot(mx - cursor[0], my - cursor[1]) <= raioPx) return { ponto: meio, tipo: "meio" };
  }
  return { ponto: acerto.ponto, tipo: "aresta" };
}
