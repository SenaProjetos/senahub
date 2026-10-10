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

/** Um aviso na tela: um modelo longe dos demais, ou um PAR longe um do outro. */
export type AvisoOrigem = {
  /** 1 modelo (ele está longe) ou 2 (estão longe um do outro, sem saber qual errou). */
  modeloIds: string[];
  /** Vizinho mais próximo, quando o aviso é de um modelo só. */
  maisProximoId: string | null;
  distancia: number;
};

/**
 * Junta os casos recíprocos: com só dois modelos afastados, cada um é "o mais
 * próximo" do outro e a tela mostrava o mesmo aviso duas vezes. Par recíproco vira
 * UM aviso com os dois — não dá para saber qual dos dois foi exportado errado.
 */
export function avisosDeOrigem(distantes: readonly ModeloDistante[]): AvisoOrigem[] {
  const porId = new Map(distantes.map((d) => [d.modeloId, d]));
  const usados = new Set<string>();
  const avisos: AvisoOrigem[] = [];
  for (const d of distantes) {
    if (usados.has(d.modeloId)) continue;
    usados.add(d.modeloId);
    const outro = porId.get(d.maisProximoId);
    if (outro && outro.maisProximoId === d.modeloId && !usados.has(outro.modeloId)) {
      usados.add(outro.modeloId);
      avisos.push({ modeloIds: [d.modeloId, outro.modeloId], maisProximoId: null, distancia: d.distancia });
    } else {
      avisos.push({ modeloIds: [d.modeloId], maisProximoId: d.maisProximoId, distancia: d.distancia });
    }
  }
  return avisos;
}
