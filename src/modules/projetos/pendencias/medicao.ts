/**
 * Medição com escala calibrada (item 28) — puro, sem I/O, no molde de `marcacao.ts`.
 *
 * **A unidade que atravessa tudo é "mm reais por PONTO do PDF"** (`mmPorPonto`). Os dois modos
 * que o solicitante pediu convergem nela:
 *
 * - **Declarar a escala** (1:50, 1:100…): um ponto do PDF vale 25,4/72 mm no papel, e no
 *   terreno vale isso × o denominador.
 * - **Calibrar por dois pontos**: mede-se um segmento de dimensão conhecida e divide-se o valor
 *   real pelo comprimento em pontos.
 *
 * Guardar o fator em mm/ponto (e não, digamos, mm por unidade normalizada) é o que faz uma
 * diagonal medir certo: coordenada normalizada é por eixo (x/largura, y/altura), então
 * `hypot(dx, dy)` em normalizado não significa nada — os dois eixos têm escalas diferentes
 * sempre que a página não é quadrada. Converte-se cada eixo para pontos ANTES de compor.
 *
 * **Espaço VISUAL, não MediaBox.** As dimensões usadas aqui são as da página como o usuário vê
 * (o viewport do pdf.js, com `/Rotate` já aplicado). Numa prancha A1 `/Rotate 270` a MediaBox é
 * 2384×1684 e o visual é 1684×2384: usar a MediaBox faria um segmento horizontal medir 41% a
 * mais, silenciosamente e com aparência plausível. Ver `carimbo/coords.ts#tamanhoVisual`.
 */

/** 1 ponto PostScript = 1/72 pol. Fator fixo do formato PDF, não é preferência. */
export const MM_POR_PONTO = 25.4 / 72;

export const MODOS_CALIBRACAO = ["escala", "dois_pontos"] as const;
export type ModoCalibracao = (typeof MODOS_CALIBRACAO)[number];

export const MODO_CALIBRACAO_LABEL: Record<ModoCalibracao, string> = {
  escala: "Escala declarada",
  dois_pontos: "Calibrada por dois pontos",
};

/** Escalas de projeto mais comuns — atalho na UI; o campo aceita qualquer denominador. */
export const ESCALAS_COMUNS = [1, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000] as const;

export type Ponto2D = { x: number; y: number };

/**
 * mm reais por ponto do PDF quando a prancha foi plotada na escala 1:`denominador`.
 * `denominador` 1 significa tamanho real no papel (útil para conferir a própria folha).
 */
export function fatorPorEscala(denominador: number): number | null {
  if (!Number.isFinite(denominador) || denominador <= 0) return null;
  return MM_POR_PONTO * denominador;
}

/**
 * mm reais por ponto a partir de um segmento de dimensão conhecida. É o modo que funciona
 * mesmo quando a prancha foi plotada fora de escala — por isso existe além do modo declarado.
 */
export function fatorPorCalibracao(comprimentoPontos: number, valorRealMm: number): number | null {
  if (!Number.isFinite(comprimentoPontos) || comprimentoPontos <= 0) return null;
  if (!Number.isFinite(valorRealMm) || valorRealMm <= 0) return null;
  return valorRealMm / comprimentoPontos;
}

/** A escala equivalente (denominador) de um fator qualquer — só para exibir "≈ 1:50". */
export function escalaEquivalente(mmPorPonto: number): number | null {
  if (!Number.isFinite(mmPorPonto) || mmPorPonto <= 0) return null;
  return mmPorPonto / MM_POR_PONTO;
}

/**
 * Comprimento em PONTOS de um segmento dado em coordenadas normalizadas (0..1) da página.
 * `larguraPt`/`alturaPt` são as dimensões VISUAIS em pontos (viewport do pdf.js em escala 1).
 */
export function comprimentoEmPontos(a: Ponto2D, b: Ponto2D, larguraPt: number, alturaPt: number): number {
  const dx = (b.x - a.x) * larguraPt;
  const dy = (b.y - a.y) * alturaPt;
  return Math.hypot(dx, dy);
}

/** Medida real, em mm, de um segmento normalizado sob um fator de calibração. */
export function medirMm(
  a: Ponto2D,
  b: Ponto2D,
  larguraPt: number,
  alturaPt: number,
  mmPorPonto: number,
): number | null {
  if (!Number.isFinite(mmPorPonto) || mmPorPonto <= 0) return null;
  const pt = comprimentoEmPontos(a, b, larguraPt, alturaPt);
  if (!(pt > 0)) return null;
  return pt * mmPorPonto;
}

/**
 * Rótulo pt-BR da medida. Troca de unidade pela ordem de grandeza porque "5000,00 mm" e
 * "0,04 m" são igualmente ruins de ler numa prancha.
 */
export function formatarMedida(mm: number | null | undefined): string {
  if (mm == null || !Number.isFinite(mm) || mm < 0) return "—";
  if (mm < 10) return `${mm.toFixed(0)} mm`;
  if (mm < 1000) return `${(mm / 10).toFixed(1).replace(".", ",")} cm`;
  return `${(mm / 1000).toFixed(2).replace(".", ",")} m`;
}

/** Rótulo curto da calibração para o cabeçalho ("1:50" ou "calibrada"). */
export function rotuloCalibracao(modo: string | null | undefined, denominador: number | null | undefined): string {
  if (modo === "escala" && denominador) return `1:${denominador}`;
  if (modo === "dois_pontos") return "calibrada";
  return "sem escala";
}
