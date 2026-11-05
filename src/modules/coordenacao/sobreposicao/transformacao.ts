// Conta do alinhamento da sobreposição 2D. Pura: sem I/O, roda também no navegador.
// Mundo em Y-baixo; `giro` em graus, positivo = horário na tela (Y-baixo):
//   x' = s(cosθ·x − sinθ·y) + tx
//   y' = s(sinθ·x + cosθ·y) + ty

export type Ponto = { x: number; y: number };

export type Alinhamento = {
  tx: number;
  ty: number;
  /** Graus, horário em Y-baixo, sempre em (-180, 180]. */
  giro: number;
  escala: number;
};

export type Caixa = { minX: number; minY: number; maxX: number; maxY: number };

export const IDENTIDADE: Alinhamento = { tx: 0, ty: 0, giro: 0, escala: 1 };

/** Dois pontos são "o mesmo" quando a distância ≤ DISTANCIA_MINIMA × max(1, diagonal da caixa dos quatro pontos). */
export const DISTANCIA_MINIMA = 1e-6;

const ERRO_MESMO_LUGAR = "Os dois pontos estão no mesmo lugar. Escolha pontos afastados.";

const PARA_RAD = Math.PI / 180;
const PARA_GRAUS = 180 / Math.PI;

function normalizarGiro(graus: number): number {
  const r = ((graus % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
}

export function aplicar(a: Alinhamento, p: Ponto): Ponto {
  const rad = a.giro * PARA_RAD;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    x: a.escala * (c * p.x - s * p.y) + a.tx,
    y: a.escala * (s * p.x + c * p.y) + a.ty,
  };
}

export function inverter(a: Alinhamento): Alinhamento {
  const escala = 1 / a.escala;
  const rad = -a.giro * PARA_RAD;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    tx: -escala * (c * a.tx - s * a.ty),
    ty: -escala * (s * a.tx + c * a.ty),
    giro: normalizarGiro(-a.giro),
    escala,
  };
}

/** `aplicar(compor(e, i), p)` = `aplicar(e, aplicar(i, p))`. */
export function compor(externo: Alinhamento, interno: Alinhamento): Alinhamento {
  const t = aplicar({ ...externo, tx: 0, ty: 0 }, { x: interno.tx, y: interno.ty });
  return {
    tx: t.x + externo.tx,
    ty: t.y + externo.ty,
    giro: normalizarGiro(externo.giro + interno.giro),
    escala: externo.escala * interno.escala,
  };
}

/** Mantém giro e escala; só ajusta tx/ty para que `origemNativa` caia em `destinoMundo`. */
export function porUmPonto(atual: Alinhamento, origemNativa: Ponto, destinoMundo: Ponto): Alinhamento {
  const sem = aplicar({ ...atual, tx: 0, ty: 0 }, origemNativa);
  return { ...atual, tx: destinoMundo.x - sem.x, ty: destinoMundo.y - sem.y };
}

/** Origens no sistema nativo da camada (o1, o2), destinos no mundo (d1, d2). */
export function porDoisPontos(
  o1: Ponto,
  o2: Ponto,
  d1: Ponto,
  d2: Ponto,
): { ok: true; alinhamento: Alinhamento } | { ok: false; erro: string } {
  const xs = [o1.x, o2.x, d1.x, d2.x];
  const ys = [o1.y, o2.y, d1.y, d2.y];
  const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const limite = DISTANCIA_MINIMA * Math.max(1, diagonal);

  const vo = { x: o2.x - o1.x, y: o2.y - o1.y };
  const vd = { x: d2.x - d1.x, y: d2.y - d1.y };
  const distOrigem = Math.hypot(vo.x, vo.y);
  const distDestino = Math.hypot(vd.x, vd.y);
  if (distOrigem <= limite || distDestino <= limite) return { ok: false, erro: ERRO_MESMO_LUGAR };

  const base: Alinhamento = {
    tx: 0,
    ty: 0,
    escala: distDestino / distOrigem,
    giro: normalizarGiro((Math.atan2(vd.y, vd.x) - Math.atan2(vo.y, vo.x)) * PARA_GRAUS),
  };
  return { ok: true, alinhamento: porUmPonto(base, o1, d1) };
}

/** Giro 0, mesma largura e centros coincidentes. */
export function encaixeInicial(caixaCamada: Caixa, caixaMundo: Caixa): Alinhamento {
  const larguraCamada = caixaCamada.maxX - caixaCamada.minX;
  const larguraMundo = caixaMundo.maxX - caixaMundo.minX;
  const escala = larguraCamada > 0 && larguraMundo > 0 ? larguraMundo / larguraCamada : 1;
  const cCamada = { x: (caixaCamada.minX + caixaCamada.maxX) / 2, y: (caixaCamada.minY + caixaCamada.maxY) / 2 };
  const cMundo = { x: (caixaMundo.minX + caixaMundo.maxX) / 2, y: (caixaMundo.minY + caixaMundo.maxY) / 2 };
  return { tx: cMundo.x - escala * cCamada.x, ty: cMundo.y - escala * cCamada.y, giro: 0, escala };
}
