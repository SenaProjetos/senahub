/**
 * Coordenação BIM — matemática PURA de medição (distância, ângulo, área) sobre
 * pontos 3D capturados no viewer. Sem three/fragments como dependência — os pontos
 * chegam como tuplas simples (espaço three, metros), mesmo padrão de coords.ts/
 * realinhamento.ts. Formatação em pt-BR com a unidade certa por tipo de medida.
 */
export type Ponto3D = [number, number, number];

function subtrair(a: Ponto3D, b: Ponto3D): Ponto3D {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function norma(v: Ponto3D): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function produtoEscalar(a: Ponto3D, b: Ponto3D): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function produtoVetorial(a: Ponto3D, b: Ponto3D): Ponto3D {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Distância euclidiana entre dois pontos (metros). */
export function distancia(a: Ponto3D, b: Ponto3D): number {
  return norma(subtrair(b, a));
}

/**
 * Ângulo (graus, 0–180) no vértice `b`, formado pelos segmentos b→a e b→c.
 * Retorna null se algum dos segmentos tiver comprimento zero (pontos coincidentes).
 */
export function angulo(a: Ponto3D, b: Ponto3D, c: Ponto3D): number | null {
  const v1 = subtrair(a, b);
  const v2 = subtrair(c, b);
  const n1 = norma(v1);
  const n2 = norma(v2);
  if (n1 === 0 || n2 === 0) return null;
  // Clamp contra ruído de ponto flutuante (evita NaN em acos de ±1.0000000002).
  const cos = Math.max(-1, Math.min(1, produtoEscalar(v1, v2) / (n1 * n2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Área de um polígono 3D planar (shoelace 3D via soma de produtos vetoriais em
 * relação ao primeiro vértice) — funciona para o polígono estar em qualquer plano,
 * não só XY. Requer >= 3 pontos; pontos colineares/degenerados dão área ~0.
 */
export function areaPoligono(pontos: readonly Ponto3D[]): number {
  if (pontos.length < 3) return 0;
  const origem = pontos[0];
  let soma: Ponto3D = [0, 0, 0];
  for (let i = 1; i < pontos.length - 1; i++) {
    const v1 = subtrair(pontos[i], origem);
    const v2 = subtrair(pontos[i + 1], origem);
    const cruz = produtoVetorial(v1, v2);
    soma = [soma[0] + cruz[0], soma[1] + cruz[1], soma[2] + cruz[2]];
  }
  return norma(soma) / 2;
}

/** Formata um valor em metros para exibição pt-BR, com casas conforme a magnitude. */
export function formatarMetros(m: number): string {
  const casas = Math.abs(m) < 1 ? 3 : Math.abs(m) < 10 ? 2 : 1;
  return `${m.toFixed(casas).replace(".", ",")} m`;
}

/** Formata uma área em m² para exibição pt-BR. */
export function formatarArea(m2: number): string {
  const casas = Math.abs(m2) < 1 ? 3 : 2;
  return `${m2.toFixed(casas).replace(".", ",")} m²`;
}

/** Formata um ângulo em graus para exibição pt-BR (1 casa decimal). */
export function formatarAngulo(graus: number): string {
  return `${graus.toFixed(1).replace(".", ",")}°`;
}
