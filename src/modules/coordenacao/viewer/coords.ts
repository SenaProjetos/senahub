/**
 * Coordenação BIM — conversão pura de coordenadas three.js (Y-up) ↔ IFC (Z-up).
 * Sem dependência de three/fragments (tuplas simples) para ser testável em
 * isolamento e reutilizável pelo writer BCF (F4), que precisa da mesma fórmula.
 *
 * A câmera do Apontamento é persistida em espaço IFC — a conversão vive só
 * nesta borda (engine.ts na captura/restauração; bcf/writer.ts na exportação).
 */
export type Vec3 = [number, number, number];

/** three(x,y,z) → ifc(x,-z,y). */
export function threeParaIfc([x, y, z]: Vec3): Vec3 {
  return [x, -z, y];
}

/** Inversa exata de threeParaIfc: ifc(ix,iy,iz) → three(ix,iz,-iy). */
export function ifcParaThree([ix, iy, iz]: Vec3): Vec3 {
  return [ix, iz, -iy];
}
