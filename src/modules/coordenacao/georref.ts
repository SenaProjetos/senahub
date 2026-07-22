/**
 * Coordenação BIM — matemática/validação PURA do georreferenciamento (IfcMapConversion,
 * IFC4). Sem web-ifc/I/O — o child `scripts/georref-ifc.ts` faz a escrita no arquivo.
 *
 * IfcMapConversion posiciona a ORIGEM do modelo no CRS projetado de destino
 * (Eastings/Northings/OrthogonalHeight), com a rotação da grade dada por
 * (XAxisAbscissa, XAxisOrdinate) = (cos θ, sin θ) — θ = ângulo do eixo X do modelo
 * em relação ao Leste da grade, anti-horário. NÃO move geometria; só declara a
 * transformação para coordenadas reais.
 */
export type GeorrefParams = {
  /** Nome do CRS projetado de destino, ex.: "EPSG:31983" (SIRGAS 2000 / UTM 23S). */
  crsName: string;
  eastings: number; // m
  northings: number; // m
  orthogonalHeight: number; // m
  /** Rotação da grade (graus, anti-horário a partir do Leste). 0 = eixo X do modelo aponta pro Leste. */
  rotacaoGraus: number;
  /** Escala do mapa (1 = sem distorção). Opcional. */
  escala?: number | null;
};

export type ValidacaoGeorref = { ok: true } | { ok: false; motivo: string };

const LIMITE_COORD = 1e9; // ±1 bilhão de metros — pega valores absurdos/typos

export function validarGeorref(p: GeorrefParams): ValidacaoGeorref {
  if (!p.crsName || !p.crsName.trim()) return { ok: false, motivo: "Informe o CRS de destino (ex.: EPSG:31983)." };
  for (const [nome, v] of [
    ["Eastings", p.eastings],
    ["Northings", p.northings],
    ["Altura ortogonal", p.orthogonalHeight],
  ] as const) {
    if (!Number.isFinite(v)) return { ok: false, motivo: `${nome} deve ser um número.` };
    if (Math.abs(v) > LIMITE_COORD) return { ok: false, motivo: `${nome} fora de um intervalo plausível.` };
  }
  if (!Number.isFinite(p.rotacaoGraus)) return { ok: false, motivo: "Rotação deve ser um número." };
  if (p.escala != null && (!Number.isFinite(p.escala) || p.escala <= 0)) {
    return { ok: false, motivo: "Escala deve ser um número positivo." };
  }
  return { ok: true };
}

/** Rotação (graus, anti-horário do Leste) → (XAxisAbscissa, XAxisOrdinate) = (cos θ, sin θ). */
export function rotacaoParaEixo(graus: number): { abscissa: number; ordinate: number } {
  const rad = (graus * Math.PI) / 180;
  // Normaliza -0 → 0 (evita "-0" no STEP e ruído em testes).
  const abscissa = Math.cos(rad) + 0;
  const ordinate = Math.sin(rad) + 0;
  return { abscissa, ordinate };
}

/** Inverso: (XAxisAbscissa, XAxisOrdinate) → rotação em graus (−180, 180]. Null se ambos ~0. */
export function eixoParaRotacao(abscissa: number | null, ordinate: number | null): number | null {
  if (abscissa == null || ordinate == null) return 0; // sem rotação declarada = 0°
  if (Math.abs(abscissa) < 1e-12 && Math.abs(ordinate) < 1e-12) return null;
  return (Math.atan2(ordinate, abscissa) * 180) / Math.PI;
}
