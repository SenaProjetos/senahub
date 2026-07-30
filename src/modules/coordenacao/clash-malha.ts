/**
 * Narrowphase puro de clash por triângulos.
 *
 * O broadphase de itens continua no AABB de `clash.ts`. Aqui, uma BVH de AABB
 * reduz os pares de triângulos candidatos antes do SAT. O refinamento também tem
 * orçamento explícito e cede periodicamente a main thread; se não concluir com
 * segurança, o adapter mantém o resultado AABB.
 */
import type { Vec3 } from "@/modules/coordenacao/clash";

export type MalhaClash = {
  positions: ArrayLike<number>;
  indices?: ArrayLike<number>;
  /** Matrix4 em ordem column-major (mesma ordem de `THREE.Matrix4.elements`). */
  matriz?: ArrayLike<number>;
};

export type TrianguloClash = {
  vertices: [Vec3, Vec3, Vec3];
  min: Vec3;
  max: Vec3;
};

/** Cada componente corresponde a um MeshData/sólido independente do item IFC. */
export type ComponenteTriangulosClash = readonly TrianguloClash[];

export type ResultadoRefinoMalha = {
  status: "intersecta" | "separada" | "inconclusiva";
  /** Operações de broadphase + raios consumidas pelo orçamento cooperativo. */
  operacoes: number;
  /** Chamadas efetivas ao SAT triângulo × triângulo (teste/diagnóstico). */
  comparacoesTriangulos: number;
};

export type OpcoesRefinoMalha = {
  /**
   * Limite por par de elementos. Ao atingir, retorna `inconclusiva` e o adapter
   * preserva o clash AABB — nunca transforma falta de tempo em falso negativo.
   */
  limiteOperacoes?: number;
  /** Quantas operações podem rodar antes de devolver a main thread ao navegador. */
  operacoesPorFatia?: number;
  /** Injetável nos testes; por padrão agenda uma nova task com setTimeout(0). */
  cederControle?: () => Promise<void>;
};

const EPS = 1e-9;
const LIMITE_OPERACOES_PADRAO = 200_000;
const OPERACOES_POR_FATIA_PADRAO = 2_048;
const TRIANGULOS_POR_FOLHA = 8;

type Caixa = { min: Vec3; max: Vec3 };

type NoBvh = Caixa & {
  esquerda?: NoBvh;
  direita?: NoBvh;
  triangulos?: readonly TrianguloClash[];
};

type Orcamento = {
  operacoes: number;
  comparacoesTriangulos: number;
  limite: number;
  porFatia: number;
  cederControle: () => Promise<void>;
};

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cruz(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function produtoEscalar(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalizar(v: Vec3): Vec3 | null {
  const tamanho = Math.hypot(v[0], v[1], v[2]);
  if (tamanho <= EPS) return null;
  return [v[0] / tamanho, v[1] / tamanho, v[2] / tamanho];
}

function transformar(p: Vec3, matriz?: ArrayLike<number>): Vec3 {
  if (!matriz || matriz.length < 16) return p;
  const x = p[0];
  const y = p[1];
  const z = p[2];
  const w = matriz[3] * x + matriz[7] * y + matriz[11] * z + matriz[15];
  const divisor = Math.abs(w) > EPS ? w : 1;
  return [
    (matriz[0] * x + matriz[4] * y + matriz[8] * z + matriz[12]) / divisor,
    (matriz[1] * x + matriz[5] * y + matriz[9] * z + matriz[13]) / divisor,
    (matriz[2] * x + matriz[6] * y + matriz[10] * z + matriz[14]) / divisor,
  ];
}

function vertice(positions: ArrayLike<number>, indice: number, matriz?: ArrayLike<number>): Vec3 | null {
  const inicio = indice * 3;
  if (inicio < 0 || inicio + 2 >= positions.length) return null;
  const p: Vec3 = [Number(positions[inicio]), Number(positions[inicio + 1]), Number(positions[inicio + 2])];
  if (!p.every(Number.isFinite)) return null;
  return transformar(p, matriz);
}

/** Converte os buffers da malha em triângulos já transformados para o espaço-mundo. */
export function triangulosDaMalha(malha: MalhaClash): TrianguloClash[] {
  const totalVertices = Math.floor(malha.positions.length / 3);
  const indices = malha.indices;
  const totalIndices = indices ? indices.length : totalVertices;
  const triangulos: TrianguloClash[] = [];

  for (let i = 0; i + 2 < totalIndices; i += 3) {
    const ia = indices ? Number(indices[i]) : i;
    const ib = indices ? Number(indices[i + 1]) : i + 1;
    const ic = indices ? Number(indices[i + 2]) : i + 2;
    const a = vertice(malha.positions, ia, malha.matriz);
    const b = vertice(malha.positions, ib, malha.matriz);
    const c = vertice(malha.positions, ic, malha.matriz);
    if (!a || !b || !c) continue;
    if (!normalizar(cruz(sub(b, a), sub(c, a)))) continue;

    triangulos.push({
      vertices: [a, b, c],
      min: [
        Math.min(a[0], b[0], c[0]),
        Math.min(a[1], b[1], c[1]),
        Math.min(a[2], b[2], c[2]),
      ],
      max: [
        Math.max(a[0], b[0], c[0]),
        Math.max(a[1], b[1], c[1]),
        Math.max(a[2], b[2], c[2]),
      ],
    });
  }
  return triangulos;
}

function caixasSobrepoem(a: Caixa, b: Caixa): boolean {
  for (let eixo = 0; eixo < 3; eixo++) {
    if (a.max[eixo] < b.min[eixo] - EPS || b.max[eixo] < a.min[eixo] - EPS) return false;
  }
  return true;
}

function separadosNoEixo(a: TrianguloClash, b: TrianguloClash, eixoBruto: Vec3): boolean {
  const eixo = normalizar(eixoBruto);
  if (!eixo) return false;
  const projetar = (v: Vec3) => v[0] * eixo[0] + v[1] * eixo[1] + v[2] * eixo[2];
  const pa = a.vertices.map(projetar);
  const pb = b.vertices.map(projetar);
  return Math.max(...pa) < Math.min(...pb) - EPS || Math.max(...pb) < Math.min(...pa) - EPS;
}

/**
 * SAT triângulo × triângulo. Além das normais e produtos cruzados entre arestas,
 * testa eixos no plano das faces para cobrir corretamente triângulos coplanares.
 */
export function triangulosInterseccionam(a: TrianguloClash, b: TrianguloClash): boolean {
  if (!caixasSobrepoem(a, b)) return false;

  const [a0, a1, a2] = a.vertices;
  const [b0, b1, b2] = b.vertices;
  const arestasA: Vec3[] = [sub(a1, a0), sub(a2, a1), sub(a0, a2)];
  const arestasB: Vec3[] = [sub(b1, b0), sub(b2, b1), sub(b0, b2)];
  const normalA = cruz(arestasA[0], arestasA[1]);
  const normalB = cruz(arestasB[0], arestasB[1]);
  const eixos: Vec3[] = [normalA, normalB];

  for (const ea of arestasA) {
    eixos.push(cruz(ea, normalA));
    for (const eb of arestasB) eixos.push(cruz(ea, eb));
  }
  for (const eb of arestasB) eixos.push(cruz(eb, normalB));

  return !eixos.some((eixo) => separadosNoEixo(a, b, eixo));
}

function distanciaIntersecaoRaio(
  origem: Vec3,
  direcao: Vec3,
  triangulo: TrianguloClash,
): number | null {
  const [a, b, c] = triangulo.vertices;
  const aresta1 = sub(b, a);
  const aresta2 = sub(c, a);
  const h = cruz(direcao, aresta2);
  const determinante = produtoEscalar(aresta1, h);
  if (Math.abs(determinante) <= EPS) return null;
  const inverso = 1 / determinante;
  const s = sub(origem, a);
  const u = inverso * produtoEscalar(s, h);
  if (u < -EPS || u > 1 + EPS) return null;
  const q = cruz(s, aresta1);
  const v = inverso * produtoEscalar(direcao, q);
  if (v < -EPS || u + v > 1 + EPS) return null;
  const distancia = inverso * produtoEscalar(aresta2, q);
  return distancia > EPS ? distancia : null;
}

function caixaDaColecao(triangulos: readonly TrianguloClash[]): Caixa | null {
  const primeiro = triangulos[0];
  if (!primeiro) return null;
  const min: Vec3 = [...primeiro.min] as Vec3;
  const max: Vec3 = [...primeiro.max] as Vec3;
  for (let i = 1; i < triangulos.length; i++) {
    const triangulo = triangulos[i];
    for (let eixo = 0; eixo < 3; eixo++) {
      min[eixo] = Math.min(min[eixo], triangulo.min[eixo]);
      max[eixo] = Math.max(max[eixo], triangulo.max[eixo]);
    }
  }
  return { min, max };
}

function construirBvh(triangulos: readonly TrianguloClash[]): NoBvh | null {
  const caixa = caixaDaColecao(triangulos);
  if (!caixa) return null;
  if (triangulos.length <= TRIANGULOS_POR_FOLHA) return { ...caixa, triangulos };

  const extensoes: Vec3 = [
    caixa.max[0] - caixa.min[0],
    caixa.max[1] - caixa.min[1],
    caixa.max[2] - caixa.min[2],
  ];
  const eixo = extensoes[1] > extensoes[0]
    ? (extensoes[2] > extensoes[1] ? 2 : 1)
    : (extensoes[2] > extensoes[0] ? 2 : 0);
  const ordenados = [...triangulos].sort(
    (a, b) => (a.min[eixo] + a.max[eixo]) - (b.min[eixo] + b.max[eixo]),
  );
  const meio = Math.floor(ordenados.length / 2);
  const esquerda = construirBvh(ordenados.slice(0, meio));
  const direita = construirBvh(ordenados.slice(meio));
  if (!esquerda || !direita) return { ...caixa, triangulos };
  return { ...caixa, esquerda, direita };
}

function pontoNaCaixa(ponto: Vec3, caixa: Caixa): boolean {
  return (
    ponto[0] >= caixa.min[0] - EPS &&
    ponto[0] <= caixa.max[0] + EPS &&
    ponto[1] >= caixa.min[1] - EPS &&
    ponto[1] <= caixa.max[1] + EPS &&
    ponto[2] >= caixa.min[2] - EPS &&
    ponto[2] <= caixa.max[2] + EPS
  );
}

async function consumirOperacao(orcamento: Orcamento): Promise<boolean> {
  orcamento.operacoes += 1;
  if (orcamento.operacoes > orcamento.limite) return false;
  if (orcamento.operacoes % orcamento.porFatia === 0) await orcamento.cederControle();
  return true;
}

async function superficiesInterseccionam(
  a: readonly TrianguloClash[],
  b: readonly TrianguloClash[],
  orcamento: Orcamento,
): Promise<"intersecta" | "separada" | "inconclusiva"> {
  if (a.length === 0 || b.length === 0) return "separada";

  // Consulta o menor conjunto contra a BVH do maior. Em modelos usuais isto reduz
  // dezenas de milhões de pares cartesianos a poucas folhas AABB candidatas.
  const consultas = a.length <= b.length ? a : b;
  const indexados = consultas === a ? b : a;
  const raiz = construirBvh(indexados);
  if (!raiz) return "separada";

  for (const triangulo of consultas) {
    const pilha: NoBvh[] = [raiz];
    while (pilha.length > 0) {
      if (!(await consumirOperacao(orcamento))) return "inconclusiva";
      const no = pilha.pop()!;
      if (!caixasSobrepoem(triangulo, no)) continue;
      if (no.triangulos) {
        for (const candidato of no.triangulos) {
          if (!(await consumirOperacao(orcamento))) return "inconclusiva";
          if (!caixasSobrepoem(triangulo, candidato)) continue;
          orcamento.comparacoesTriangulos += 1;
          if (triangulosInterseccionam(triangulo, candidato)) return "intersecta";
        }
      } else {
        if (no.esquerda) pilha.push(no.esquerda);
        if (no.direita) pilha.push(no.direita);
      }
    }
  }
  return "separada";
}

/**
 * Teste de ponto dentro de uma superfície fechada por paridade de raios. Três
 * direções não alinhadas e deduplicação das distâncias evitam a maioria dos casos
 * degenerados (raio passando exatamente por uma aresta compartilhada).
 */
async function pontoDentroDaColecao(
  ponto: Vec3,
  triangulos: readonly TrianguloClash[],
  orcamento: Orcamento,
): Promise<boolean | null> {
  const direcoes: Vec3[] = [
    [1, 0.371, 0.193],
    [-0.217, 1, 0.419],
    [0.337, -0.181, 1],
  ];
  let votosDentro = 0;
  for (const direcaoBruta of direcoes) {
    const direcao = normalizar(direcaoBruta)!;
    const distancias: number[] = [];
    for (const triangulo of triangulos) {
      if (!(await consumirOperacao(orcamento))) return null;
      const distancia = distanciaIntersecaoRaio(ponto, direcao, triangulo);
      if (distancia != null) distancias.push(distancia);
    }
    distancias.sort((a, b) => a - b);
    const unicas: number[] = [];
    for (const distancia of distancias) {
      const anterior = unicas.at(-1);
      if (anterior === undefined || Math.abs(distancia - anterior) > 1e-7) unicas.push(distancia);
    }
    if (unicas.length % 2 === 1) votosDentro += 1;
  }
  return votosDentro >= 2;
}

/**
 * Amostras distribuídas evitam depender só do primeiro triângulo quando um
 * MeshData excepcionalmente agrupa mais de uma casca desconectada.
 */
function pontosAmostra(componente: readonly TrianguloClash[]): Vec3[] {
  if (componente.length === 0) return [];
  const indices = new Set([0, Math.floor(componente.length / 2), componente.length - 1]);
  return [...indices].map((indice) => componente[indice].vertices[0]);
}

async function algumaContencao(
  fontes: readonly ComponenteTriangulosClash[],
  recipientes: readonly ComponenteTriangulosClash[],
  orcamento: Orcamento,
): Promise<boolean | null> {
  const caixasRecipientes = recipientes.map(caixaDaColecao);
  for (const fonte of fontes) {
    for (const ponto of pontosAmostra(fonte)) {
      for (let indice = 0; indice < recipientes.length; indice++) {
        const caixa = caixasRecipientes[indice];
        if (!caixa || !pontoNaCaixa(ponto, caixa)) continue;
        const dentro = await pontoDentroDaColecao(ponto, recipientes[indice], orcamento);
        if (dentro == null) return null;
        if (dentro) return true;
      }
    }
  }
  return false;
}

/**
 * Refina um par AABB por componentes de malha, sem produto cartesiano bruto.
 *
 * - BVH de AABB poda triângulos distantes antes do SAT;
 * - cada MeshData permanece um componente independente para contenção;
 * - o loop cede a main thread periodicamente;
 * - estouro do orçamento é `inconclusiva`, portanto o adapter mantém o AABB.
 */
export async function refinarComponentesTriangulos(
  a: readonly ComponenteTriangulosClash[],
  b: readonly ComponenteTriangulosClash[],
  opcoes: OpcoesRefinoMalha = {},
): Promise<ResultadoRefinoMalha> {
  const cederControle =
    opcoes.cederControle ??
    (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const orcamento: Orcamento = {
    operacoes: 0,
    comparacoesTriangulos: 0,
    limite: Math.max(1, opcoes.limiteOperacoes ?? LIMITE_OPERACOES_PADRAO),
    porFatia: Math.max(1, opcoes.operacoesPorFatia ?? OPERACOES_POR_FATIA_PADRAO),
    cederControle,
  };
  const componentesA = a.filter((componente) => componente.length > 0);
  const componentesB = b.filter((componente) => componente.length > 0);

  for (const componenteA of componentesA) {
    for (const componenteB of componentesB) {
      const superficie = await superficiesInterseccionam(componenteA, componenteB, orcamento);
      if (superficie === "intersecta") {
        return {
          status: "intersecta",
          operacoes: orcamento.operacoes,
          comparacoesTriangulos: orcamento.comparacoesTriangulos,
        };
      }
      if (superficie === "inconclusiva") {
        return {
          status: "inconclusiva",
          operacoes: orcamento.operacoes,
          comparacoesTriangulos: orcamento.comparacoesTriangulos,
        };
      }
    }
  }

  // Superfícies fechadas podem não se tocar quando um sólido está inteiro dentro
  // do outro. Testa cada componente — inclusive o segundo/terceiro MeshData.
  const aDentroB = await algumaContencao(componentesA, componentesB, orcamento);
  const bDentroA = aDentroB === true ? false : await algumaContencao(componentesB, componentesA, orcamento);
  const status =
    aDentroB == null || bDentroA == null
      ? "inconclusiva"
      : aDentroB || bDentroA
        ? "intersecta"
        : "separada";
  return {
    status,
    operacoes: orcamento.operacoes,
    comparacoesTriangulos: orcamento.comparacoesTriangulos,
  };
}
