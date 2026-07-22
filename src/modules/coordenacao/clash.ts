/**
 * Coordenação BIM — detecção de conflitos (clash) PURA entre dois conjuntos de
 * elementos, por bounding-box (AABB) com tolerância. Sem three/fragments — recebe
 * caixas já em espaço-mundo (metros) e devolve os pares que se interpenetram.
 *
 * v1 = AABB + tolerância (decisão do F0, ver docs/superpowers/plans/
 * 2026-07-21-compatibilizacao-ferramentas.md): rápido, testável, entrega o grosso.
 * Narrowphase triângulo-a-triângulo (Möller, via getItemsGeometry) fica documentado
 * como v2 num futuro `clash-malha.ts` — refina os pares que este módulo já achou.
 *
 * Broadphase: sweep-and-prune no eixo X (ordena por min.x, mantém lista ativa podada
 * por max.x) — evita o O(n²) ingênuo entre as duas listas. Narrowphase v1: teste de
 * sobreposição AABB nos 3 eixos, exigindo penetração > tolerância em TODOS (encoste
 * puro, i.e. faces coladas, não conta como conflito).
 */
export type Vec3 = [number, number, number];

export type Caixa = {
  localId: number;
  min: Vec3;
  max: Vec3;
};

export type Conflito = {
  localIdA: number;
  localIdB: number;
  /** Menor penetração entre os 3 eixos (m) — profundidade do conflito. */
  profundidade: number;
  /** Centro do volume de interseção (espaço-mundo) — âncora p/ câmera/pin. */
  centro: Vec3;
};

/** Tolerância padrão (m): ignora sobreposições menores que 1 mm (ruído/encoste). */
export const TOLERANCIA_PADRAO = 0.001;

/**
 * Sobreposição de duas AABBs exigindo penetração > `tol` em todos os eixos.
 * Retorna a profundidade (menor penetração entre eixos) + centro da interseção, ou
 * null se não conflitam (separados ou só encostados dentro da tolerância).
 */
export function sobreposicaoAABB(a: Caixa, b: Caixa, tol: number): Conflito | null {
  const interMin: Vec3 = [0, 0, 0];
  const interMax: Vec3 = [0, 0, 0];
  let profundidade = Infinity;
  for (let i = 0; i < 3; i++) {
    const lo = Math.max(a.min[i], b.min[i]);
    const hi = Math.min(a.max[i], b.max[i]);
    const ov = hi - lo;
    if (ov <= tol) return null; // separados ou só encostando neste eixo → sem conflito
    interMin[i] = lo;
    interMax[i] = hi;
    if (ov < profundidade) profundidade = ov;
  }
  return {
    localIdA: a.localId,
    localIdB: b.localId,
    profundidade,
    centro: [
      (interMin[0] + interMax[0]) / 2,
      (interMin[1] + interMax[1]) / 2,
      (interMin[2] + interMax[2]) / 2,
    ],
  };
}

/**
 * Detecta conflitos ENTRE os dois conjuntos (nunca dentro do mesmo). Sweep-and-prune
 * no eixo X + teste AABB nos pares candidatos. `localIdA`/`localIdB` no resultado
 * seguem sempre a origem (A = primeiro conjunto, B = segundo).
 */
export function detectarConflitos(
  caixasA: readonly Caixa[],
  caixasB: readonly Caixa[],
  tolerancia = TOLERANCIA_PADRAO,
): Conflito[] {
  type CaixaTag = Caixa & { grupo: 0 | 1 };
  const todas: CaixaTag[] = [
    ...caixasA.map((c) => ({ ...c, grupo: 0 as const })),
    ...caixasB.map((c) => ({ ...c, grupo: 1 as const })),
  ];
  // Ordena por início no eixo X — base do sweep-and-prune.
  todas.sort((x, y) => x.min[0] - y.min[0]);

  const conflitos: Conflito[] = [];
  const ativos: CaixaTag[] = [];
  for (const atual of todas) {
    // Poda: remove da lista ativa quem já terminou (max.x) antes do início do atual.
    for (let i = ativos.length - 1; i >= 0; i--) {
      if (ativos[i].max[0] < atual.min[0]) ativos.splice(i, 1);
    }
    for (const outro of ativos) {
      if (outro.grupo === atual.grupo) continue; // só conflitos entre-conjuntos
      // A = grupo 0, B = grupo 1 — normaliza a ordem no resultado.
      const [ca, cb] = atual.grupo === 0 ? [atual, outro] : [outro, atual];
      const c = sobreposicaoAABB(ca, cb, tolerancia);
      if (c) conflitos.push(c);
    }
    ativos.push(atual);
  }
  return conflitos;
}
