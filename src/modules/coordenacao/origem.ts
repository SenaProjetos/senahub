/**
 * Coordenação BIM — aviso de origem incompatível (PURO): ao carregar os modelos,
 * acusa o que ficou longe dos demais — sinal típico de IFC exportado com outra origem
 * (ponto base do projeto × coordenadas compartilhadas). Recebe as caixas de cada
 * modelo no mundo do viewer (metros) e só aponta; quem corrige é o Realinhar.
 *
 * Critério: o vão até o modelo mais próximo passa de `limiteMetros` E é maior que o
 * próprio tamanho do modelo. A segunda condição evita acusar um anexo vizinho ou o
 * terreno, que ficam a dezenas de metros de propósito.
 */
import type { Vec3 } from "@/modules/coordenacao/viewer/coords";

export type CaixaDoModelo = { modeloId: string; min: Vec3; max: Vec3 };

export type ModeloDistante = {
  modeloId: string;
  /** Vão (m) até a caixa do modelo mais próximo. */
  distancia: number;
  /** Modelo mais próximo, para a mensagem. */
  maisProximoId: string;
};

export const LIMITE_ORIGEM_METROS = 50;

/** Menor distância entre duas caixas (0 se se tocam ou se cruzam). */
export function vaoEntreCaixas(a: CaixaDoModelo, b: CaixaDoModelo): number {
  let soma = 0;
  for (let i = 0; i < 3; i++) {
    const vao = Math.max(0, a.min[i] - b.max[i], b.min[i] - a.max[i]);
    soma += vao * vao;
  }
  return Math.sqrt(soma);
}

function tamanho(c: CaixaDoModelo): number {
  return Math.hypot(c.max[0] - c.min[0], c.max[1] - c.min[1], c.max[2] - c.min[2]);
}

/** Modelos longe de todos os outros, do mais distante para o menos. */
export function modelosDistantes(
  caixas: readonly CaixaDoModelo[],
  limiteMetros = LIMITE_ORIGEM_METROS,
): ModeloDistante[] {
  const validas = caixas.filter((c) => c.min.every(Number.isFinite) && c.max.every(Number.isFinite));
  if (validas.length < 2) return [];
  const resultado: ModeloDistante[] = [];
  for (const c of validas) {
    let melhor: { id: string; vao: number } | null = null;
    for (const outra of validas) {
      if (outra.modeloId === c.modeloId) continue;
      const vao = vaoEntreCaixas(c, outra);
      if (!melhor || vao < melhor.vao) melhor = { id: outra.modeloId, vao };
    }
    if (melhor && melhor.vao > limiteMetros && melhor.vao > tamanho(c)) {
      resultado.push({ modeloId: c.modeloId, distancia: melhor.vao, maisProximoId: melhor.id });
    }
  }
  return resultado.sort((x, y) => y.distancia - x.distancia);
}

/** "850 m" / "1,2 km" / "12 km" — distância legível para o aviso. */
export function formatarDistancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`;
  const km = metros / 1000;
  return `${km.toLocaleString("pt-BR", { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}
