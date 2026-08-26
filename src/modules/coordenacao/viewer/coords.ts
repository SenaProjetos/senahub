/**
 * Coordenação BIM — conversão pura de coordenadas three.js (Y-up) ↔ IFC (Z-up).
 * Sem dependência de three/fragments (tuplas simples) para ser testável em
 * isolamento e reutilizável pelo writer BCF (F4), que precisa da mesma fórmula.
 *
 * A câmera do Apontamento é persistida em espaço IFC — a conversão vive só
 * nesta borda (engine.ts na captura/restauração; bcf/writer.ts na exportação).
 */
export type Vec3 = [number, number, number];
export type EixoIfc = "x" | "y" | "z";

/** three(x,y,z) → ifc(x,-z,y). */
export function threeParaIfc([x, y, z]: Vec3): Vec3 {
  return [x, -z, y];
}

/** Inversa exata de threeParaIfc: ifc(ix,iy,iz) → three(ix,iz,-iy). */
export function ifcParaThree([ix, iy, iz]: Vec3): Vec3 {
  return [ix, iz, -iy];
}

/**
 * Plano de corte escolhido nos eixos IFC, convertido para o espaço three.
 * O gizmo do viewer também usa a convenção IFC: X→X, Y→−Z e Z→Y.
 */
export function planoCorteIfcParaThree(
  eixo: EixoIfc,
  posicao: number,
  minThree: Vec3,
  maxThree: Vec3,
): { normal: Vec3; ponto: Vec3 } {
  let min: number;
  let max: number;
  let indiceIfc: 0 | 1 | 2;

  if (eixo === "x") {
    min = minThree[0];
    max = maxThree[0];
    indiceIfc = 0;
  } else if (eixo === "y") {
    // IFC Y é o oposto de Z no three: [min,max] = [−maxZ,−minZ].
    min = -maxThree[2];
    max = -minThree[2];
    indiceIfc = 1;
  } else {
    min = minThree[1];
    max = maxThree[1];
    indiceIfc = 2;
  }

  const pontoIfc: Vec3 = [0, 0, 0];
  const normalIfc: Vec3 = [0, 0, 0];
  pontoIfc[indiceIfc] = min + (max - min) * posicao;
  normalIfc[indiceIfc] = -1;

  return {
    normal: ifcParaThree(normalIfc),
    ponto: ifcParaThree(pontoIfc),
  };
}
