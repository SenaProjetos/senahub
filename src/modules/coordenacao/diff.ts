/**
 * Coordenação BIM — comparação PURA de duas versões do mesmo modelo (diff), por
 * IfcGuid. Sem three/fragments — recebe, para cada versão, um mapa guid→centro do
 * bounding-box (espaço-mundo, metros) e classifica cada elemento.
 *
 * Decisão do F0 (2026-07-22, ver docs/superpowers/plans/2026-07-21-…):
 *   - identidade = IfcGuid (estável entre versões/exports);
 *   - adicionado = guid só na NOVA; removido = guid só na ANTIGA;
 *   - movido = guid nas duas, mas centro do bbox deslocou > tolerância (sem parsing
 *     de placement; 'redimensionado' fica pra v2).
 */
export type Vec3 = [number, number, number];
export type CentroPorGuid = Map<string, Vec3>;

export type ResultadoDiff = {
  adicionados: string[]; // guids só na versão nova
  removidos: string[]; // guids só na versão antiga
  movidos: { guid: string; delta: number }[]; // guids nas duas, centro deslocou > tolerância
  /** Quantos guids existem nas duas versões e NÃO se moveram além da tolerância. */
  inalterados: number;
};

/** Tolerância padrão (m): considera 'movido' só quem deslocou mais que 1 cm. */
export const TOLERANCIA_MOVIDO = 0.01;

function distancia(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Compara versão ANTIGA × NOVA (mapas guid→centro) e classifica cada elemento.
 * `movidos` vem ordenado por maior deslocamento primeiro (mais relevante no topo).
 */
export function diffVersoes(
  antiga: CentroPorGuid,
  nova: CentroPorGuid,
  tolerancia = TOLERANCIA_MOVIDO,
): ResultadoDiff {
  const adicionados: string[] = [];
  const removidos: string[] = [];
  const movidos: { guid: string; delta: number }[] = [];
  let inalterados = 0;

  for (const [guid, centroNovo] of nova) {
    const centroAntigo = antiga.get(guid);
    if (centroAntigo === undefined) {
      adicionados.push(guid);
      continue;
    }
    const delta = distancia(centroAntigo, centroNovo);
    if (delta > tolerancia) movidos.push({ guid, delta });
    else inalterados++;
  }
  for (const guid of antiga.keys()) {
    if (!nova.has(guid)) removidos.push(guid);
  }

  movidos.sort((a, b) => b.delta - a.delta);
  return { adicionados, removidos, movidos, inalterados };
}
