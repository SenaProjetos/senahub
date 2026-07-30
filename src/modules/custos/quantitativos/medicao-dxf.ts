/**
 * Medição semi-automática sobre DXF convertido — PURO, sem I/O. Reusa `CenaDwg`/`Primitiva` de
 * `modules/dwg/parse.ts` (já existe e é testado). Diferente do PDF: o DXF já tem coordenadas
 * reais (mm), então não precisa de régua — só escolher camadas.
 */
import type { CenaDwg, Primitiva, Ponto } from "@/modules/dwg/parse";

export type LinhaComprimentoPorCamada = { camada: string; comprimento: number };
export type LinhaAreaPorCamada = { camada: string; area: number };

function distancia(a: Ponto, b: Ponto): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Comprimento de um arco (graus, convenção DXF anti-horária) — 0..360 tratado como volta completa. */
function comprimentoArco(raio: number, a0Graus: number, a1Graus: number): number {
  let delta = ((a1Graus - a0Graus) % 360 + 360) % 360;
  if (delta === 0) delta = 360;
  return raio * ((delta * Math.PI) / 180);
}

function comprimentoPrimitiva(p: Primitiva): number {
  switch (p.tipo) {
    case "linha":
      return distancia(p.p1, p.p2);
    case "polilinha": {
      let total = 0;
      for (let i = 1; i < p.pontos.length; i++) total += distancia(p.pontos[i - 1], p.pontos[i]);
      if (p.fechada && p.pontos.length > 2) total += distancia(p.pontos[p.pontos.length - 1], p.pontos[0]);
      return total;
    }
    case "circulo":
      return 2 * Math.PI * p.raio;
    case "arco":
      return comprimentoArco(p.raio, p.a0, p.a1);
    case "texto":
      return 0;
  }
}

/** Soma o comprimento de todas as primitivas por camada. `camadas` filtra (undefined = todas). */
export function comprimentoPorCamada(cena: CenaDwg, camadas?: readonly string[]): LinhaComprimentoPorCamada[] {
  const filtro = camadas ? new Set(camadas) : null;
  const somas = new Map<string, number>();
  for (const p of cena.primitivas) {
    if (filtro && !filtro.has(p.camada)) continue;
    somas.set(p.camada, (somas.get(p.camada) ?? 0) + comprimentoPrimitiva(p));
  }
  return [...somas.entries()]
    .map(([camada, comprimento]) => ({ camada, comprimento }))
    .sort((a, b) => a.camada.localeCompare(b.camada));
}

function areaShoelace(pontos: readonly Ponto[]): number {
  if (pontos.length < 3) return 0;
  let soma = 0;
  for (let i = 0; i < pontos.length; i++) {
    const atual = pontos[i];
    const prox = pontos[(i + 1) % pontos.length];
    soma += atual.x * prox.y - prox.x * atual.y;
  }
  return Math.abs(soma) / 2;
}

/** Soma a área das polilinhas FECHADAS por camada (abertas não têm área). */
export function areaPolilinhasFechadasPorCamada(cena: CenaDwg, camadas?: readonly string[]): LinhaAreaPorCamada[] {
  const filtro = camadas ? new Set(camadas) : null;
  const somas = new Map<string, number>();
  for (const p of cena.primitivas) {
    if (p.tipo !== "polilinha" || !p.fechada) continue;
    if (filtro && !filtro.has(p.camada)) continue;
    somas.set(p.camada, (somas.get(p.camada) ?? 0) + areaShoelace(p.pontos));
  }
  return [...somas.entries()]
    .map(([camada, area]) => ({ camada, area }))
    .sort((a, b) => a.camada.localeCompare(b.camada));
}
