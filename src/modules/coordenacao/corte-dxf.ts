/**
 * Coordenação BIM — corte do visualizador vira desenho 2D em DXF (PURO).
 *
 * O viewer entrega os segmentos onde o plano de corte cruza cada modelo (linhas do
 * `getSection` do fragments, espaço three/mundo). Aqui eles voltam para coordenadas
 * do ARQUIVO IFC (metros, Z para cima), são projetados no plano do corte e saem em
 * milímetros num DXF R12 (lib/dxf.ts), uma camada por modelo.
 *
 * Projeção (quem olha o desenho):
 *   - corte em Z → planta, vista de cima: x = X, y = Y;
 *   - corte em Y → vista frontal (de −Y para +Y): x = X, y = Z;
 *   - corte em X → vista lateral direita (de +X para −X): x = Y, y = Z.
 * Manter as coordenadas do arquivo (sem recentralizar) deixa o DXF sobrepor-se ao
 * desenho do CAD que usa a mesma origem.
 */
import { DxfDocumento, type Ponto } from "@/lib/dxf";
import { threeParaIfc, type EixoIfc, type Vec3 } from "@/modules/coordenacao/viewer/coords";

/** Segmento em espaço three (mundo do viewer). */
export type SegmentoMundo = readonly [Vec3, Vec3];

export type CamadaCorte = { nome: string; segmentos: readonly SegmentoMundo[] };

/** Segmentos mais curtos que isto (mm) são ruído do cálculo e ficam fora. */
const COMPRIMENTO_MINIMO_MM = 0.01;

/** Cores ACI das camadas, em rodízio (vermelho, amarelo, verde, ciano, azul, magenta). */
const CORES = [1, 2, 3, 4, 5, 6];

/**
 * Ponto do mundo do viewer → ponto do desenho (mm). `base` são as coordenadas que o
 * viewer somou a todos os modelos (`FragmentsModels.baseCoordinates`, espaço three):
 * arquivo = threeParaIfc(mundo − base).
 */
export function pontoNoDesenho(mundo: Vec3, eixo: EixoIfc, base: readonly number[] | null): Ponto {
  const b = base && base.length >= 3 ? base : [0, 0, 0];
  const [x, y, z] = threeParaIfc([mundo[0] - b[0], mundo[1] - b[1], mundo[2] - b[2]]);
  const mm = (n: number) => n * 1000 + 0; // + 0 tira o -0
  if (eixo === "z") return { x: mm(x), y: mm(y) };
  if (eixo === "y") return { x: mm(x), y: mm(z) };
  return { x: mm(y), y: mm(z) };
}

/** Nome de camada curto e aceito pelo DXF R12 a partir do nome do arquivo/disciplina. */
export function nomeDeCamada(rotulo: string): string {
  const semExtensao = rotulo.replace(/\.[a-z0-9]+$/i, "");
  const ultimo = semExtensao.split(/[·/\\]/).pop()?.trim() || semExtensao;
  return ultimo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_$.-]/g, "")
    .slice(0, 31) || "CORTE";
}

/** Monta o DXF do corte. Devolve o texto do arquivo e quantas linhas entraram. */
export function gerarDxfDoCorte(entrada: {
  eixo: EixoIfc;
  camadas: readonly CamadaCorte[];
  base: readonly number[] | null;
}): { dxf: string; linhas: number } {
  const doc = new DxfDocumento();
  let linhas = 0;
  entrada.camadas.forEach((camada, i) => {
    const nome = nomeDeCamada(camada.nome);
    doc.camada(nome, CORES[i % CORES.length]);
    for (const [a, b] of camada.segmentos) {
      const p1 = pontoNoDesenho(a, entrada.eixo, entrada.base);
      const p2 = pontoNoDesenho(b, entrada.eixo, entrada.base);
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < COMPRIMENTO_MINIMO_MM) continue;
      doc.linha(p1, p2, { camada: nome });
      linhas += 1;
    }
  });
  return { dxf: doc.toString(), linhas };
}

/** Nome do arquivo para download: `<projeto>-corte-<eixo>.dxf`. */
export function nomeDoArquivoDeCorte(projetoCodigo: string, eixo: EixoIfc): string {
  const projeto = projetoCodigo.replace(/[^A-Za-z0-9._-]+/g, "_") || "projeto";
  const tipo = eixo === "z" ? "planta" : `corte-${eixo}`;
  return `${projeto}-${tipo}.dxf`;
}
