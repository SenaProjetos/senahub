/**
 * Coordenação BIM — lógica PURA do realinhamento (offset) de um IFC.
 *
 * Sem I/O (nem web-ifc, nem fs, nem Prisma) para ser testável em isolamento — mesmo
 * padrão de conversao-estado.ts / viewer/coords.ts / bcf/writer.ts. O child process
 * scripts/deslocar-ifc.ts aplica estas funções sobre o modelo aberto no web-ifc; a
 * matemática do vetor, a conversão de unidade e a conversão de eixos three↔IFC ficam
 * todas aqui.
 *
 * Convenção do vetor: o usuário informa o deslocamento em ESPAÇO IFC (Z-up), em
 * METROS. As coordenadas internas do arquivo (IfcCartesianPoint) estão na unidade
 * de comprimento declarada em IfcProject.UnitsInContext — por isso o offset em metros
 * é convertido para a unidade do arquivo antes de somar.
 */
import { threeParaIfc, type Vec3 } from "@/modules/coordenacao/viewer/coords";

/** Vetor de deslocamento em espaço IFC (Z-up), em metros — como o usuário informa. */
export type VetorMetros = Vec3;

/**
 * Fator de conversão para METROS por prefixo SI de comprimento do IFC.
 * O IFC declara a unidade base como IfcSIUnit (Name=METRE) com um Prefix opcional
 * (MILLI, CENTI, …). O fator é "quantos metros vale 1 unidade do arquivo".
 */
export const FATOR_METROS_POR_PREFIXO: Record<string, number> = {
  EXA: 1e18,
  PETA: 1e15,
  TERA: 1e12,
  GIGA: 1e9,
  MEGA: 1e6,
  KILO: 1e3,
  HECTO: 1e2,
  DECA: 1e1,
  "": 1, // METRE sem prefixo
  DECI: 1e-1,
  CENTI: 1e-2,
  MILLI: 1e-3,
  MICRO: 1e-6,
  NANO: 1e-9,
  PICO: 1e-12,
  FEMTO: 1e-15,
  ATTO: 1e-18,
};

/**
 * Metros por 1 unidade do arquivo. Prefixo ausente = METRE (fator 1); prefixo
 * desconhecido também cai em 1 (deixa o offset ser aplicado como se fosse metros,
 * em vez de falhar) — o child loga um aviso nesse caso.
 */
export function fatorMetros(prefixo: string | null | undefined): number {
  if (prefixo == null) return 1;
  const f = FATOR_METROS_POR_PREFIXO[prefixo.trim().toUpperCase()];
  return typeof f === "number" ? f : 1;
}

/** Converte um vetor em metros para a unidade interna do arquivo (÷ fator). */
export function metrosParaUnidadeArquivo(v: VetorMetros, fator: number): Vec3 {
  return [v[0] / fator, v[1] / fator, v[2] / fator];
}

/**
 * Soma o offset às coordenadas de um IfcCartesianPoint (na MESMA unidade).
 * Um IfcCartesianPoint pode ser 2D — nesse caso só X,Y são deslocados; a terceira
 * componente, quando existir, recebe dz. Componentes extras (nunca há em ponto 3D)
 * ficam intactas.
 */
export function somarOffset(coords: readonly number[], offset: Vec3): number[] {
  return coords.map((c, i) => (i < 3 ? c + offset[i] : c));
}

/**
 * Converte um arraste no plano de chão do three (Y-up) para o vetor horizontal IFC.
 * O arraste devolve (Δx, Δz) no plano horizontal do three; a altura (dz IFC) vem de
 * campo numérico separado. three(Δx, 0, Δz) → ifc = [Δx, −Δz, 0].
 */
export function arrastePlanoParaIfc(deltaXThree: number, deltaZThree: number): { dx: number; dy: number } {
  const [dx, dy] = threeParaIfc([deltaXThree, 0, deltaZThree]);
  // `+ 0` normaliza o -0 que threeParaIfc produz quando Δz é 0 (troca de sinal).
  return { dx: dx + 0, dy: dy + 0 };
}

/** Vetor "efetivamente nulo" (nada a deslocar) — tolerância p/ ruído de arraste. */
export function vetorNulo(v: VetorMetros, tol = 1e-9): boolean {
  return Math.abs(v[0]) < tol && Math.abs(v[1]) < tol && Math.abs(v[2]) < tol;
}

/** Alcance máximo por eixo (10.000 km) — muito além de qualquer caso real; barra NaN/absurdo. */
export const OFFSET_MAX_METROS = 1e7;

/** Valida o vetor: componentes finitas e dentro de um alcance são. */
export function validarVetor(v: VetorMetros): { ok: boolean; motivo?: string } {
  for (const c of v) {
    if (!Number.isFinite(c)) {
      return { ok: false, motivo: "Vetor de deslocamento inválido (valor não numérico)." };
    }
    if (Math.abs(c) > OFFSET_MAX_METROS) {
      return { ok: false, motivo: "Deslocamento fora de alcance (máx. 10.000 km por eixo)." };
    }
  }
  return { ok: true };
}

/**
 * Deriva o caminho relativo da NOVA versão realinhada a partir do caminho do IFC
 * original: MESMA pasta, nome-base sem o sufixo `__vN` e sem extensão, com `__v{n}.ifc`.
 * Espelha a convenção de versionamento de uploads (`${base}__v${versao}.ext`), para o
 * arquivo resultante cair no mesmo grupo de versões que a lista de arquivos agrupa.
 */
export function caminhoVersaoRealinhada(caminhoOriginal: string, novaVersao: number): string {
  const norm = caminhoOriginal.replace(/\\/g, "/");
  const barra = norm.lastIndexOf("/");
  const dir = barra >= 0 ? norm.slice(0, barra) : "";
  const arquivo = barra >= 0 ? norm.slice(barra + 1) : norm;
  const base = arquivo.replace(/\.ifc$/i, "").replace(/__v\d+$/i, "");
  const nome = `${base}__v${novaVersao}.ifc`;
  return dir ? `${dir}/${nome}` : nome;
}

// ── Rotação em planta (giro em torno do eixo vertical Z do IFC) ──────────────
//
// O realinhamento aceita, além do vetor, um ângulo em GRAUS (anti-horário visto de
// cima, convenção do IFC) em torno de um PIVÔ em planta — o centro do modelo na prévia.
// O mapa aplicado a cada ponto é p' = R·(p − pivô) + pivô + vetor, ou seja: gira em
// torno do pivô e depois translada. O vetor continua sendo "quanto o centro andou".
// No arquivo, os placements raiz só sabem girar em torno da ORIGEM, então o mapa é
// reescrito como p' = R·p + t', com t' = vetor + pivô − R·pivô (`translacaoSobreOrigem`).

/** Pivô do giro em planta (x, y), espaço IFC, metros. */
export type PivoPlanta = [number, number];

/** Alcance do ângulo aceito (uma volta para cada lado). */
export const ROTACAO_MAX_GRAUS = 360;

/** Valida o ângulo do giro: finito e dentro de uma volta. */
export function validarRotacao(graus: number): { ok: boolean; motivo?: string } {
  if (!Number.isFinite(graus)) return { ok: false, motivo: "Ângulo de rotação inválido (valor não numérico)." };
  if (Math.abs(graus) > ROTACAO_MAX_GRAUS) {
    return { ok: false, motivo: `Ângulo de rotação fora de alcance (máx. ${ROTACAO_MAX_GRAUS}° para cada lado).` };
  }
  return { ok: true };
}

/** Giro "efetivamente nulo" — uma volta inteira também não muda nada. */
export function rotacaoNula(graus: number, tol = 1e-9): boolean {
  const resto = ((graus % 360) + 360) % 360;
  return resto < tol || 360 - resto < tol;
}

/** Nada a gravar: nem deslocamento nem giro. */
export function realinhamentoNulo(v: VetorMetros, graus: number): boolean {
  return vetorNulo(v) && rotacaoNula(graus);
}

/**
 * Gira as DUAS primeiras componentes (x, y) em torno da origem pelo ângulo em graus;
 * a terceira (z) e extras ficam intactas. Serve a pontos e a direções (2D ou 3D).
 */
export function girarXY(coords: readonly number[], graus: number): number[] {
  if (coords.length < 2) return [...coords];
  const rad = (graus * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const [x, y] = coords;
  // `+ 0` normaliza o -0 (ex.: giro de 90° em (1,0) dá -0 em x).
  return [x * c - y * s + 0, x * s + y * c + 0, ...coords.slice(2)];
}

/**
 * Translação equivalente ao "girar em torno do pivô e depois deslocar" quando o giro
 * é feito em torno da ORIGEM: t' = vetor + pivô − R·pivô. Sem giro, t' = vetor.
 */
export function translacaoSobreOrigem(vetor: VetorMetros, graus: number, pivo: PivoPlanta): Vec3 {
  if (rotacaoNula(graus)) return [vetor[0], vetor[1], vetor[2]];
  const [rx, ry] = girarXY(pivo, graus);
  return [vetor[0] + pivo[0] - rx, vetor[1] + pivo[1] - ry, vetor[2]];
}

/**
 * Pivô em espaço IFC do ARQUIVO (metros) a partir de um ponto do mundo do viewer.
 * O viewer põe todos os modelos no referencial do primeiro carregado: mundo =
 * ifcParaThree(p_arquivo) + base, onde base são as coordenadas do primeiro modelo
 * (`FragmentsModels.baseCoordinates`, espaço three). Logo p_arquivo =
 * threeParaIfc(mundo − base). Sem base (null), o mundo já é o arquivo.
 */
export function pivoDoMundo(mundo: Vec3, base: readonly number[] | null): PivoPlanta {
  const b: Vec3 = base && base.length >= 3 ? [base[0], base[1], base[2]] : [0, 0, 0];
  const [x, y] = threeParaIfc([mundo[0] - b[0], mundo[1] - b[1], mundo[2] - b[2]]);
  return [x + 0, y + 0];
}

// ── Alinhar por 2 pares de pontos ───────────────────────────────────────────
//
// Quatro cliques: A1 no modelo → B1 destino, A2 no modelo → B2 destino. A1 vai
// exatamente para B1 (3 eixos) e a direção A1→A2 gira, em planta, até a direção
// B1→B2. Os pontos A são clicados na PRÉVIA (já com o giro/vetor atuais), então o
// resultado compõe com o estado atual: novo mapa = Δ ∘ atual, com
// Δ(x) = RΔ·(x − A1) + B1. Reescrito na forma da prévia, R·(p − pivô) + pivô + vetor:
//   graus = atual + δ;  vetor = RΔ·(pivô + vetorAtual − A1) + B1 − pivô.
// Todos os pontos no mesmo referencial do pivô, com orientação IFC (Z para cima).

/** Distância mínima em planta (m) entre os pontos de cada par para o ângulo valer. */
export const DISTANCIA_MINIMA_PAR = 0.01;

/** Desvio de escala a partir do qual a tela avisa (1%). */
export const DESVIO_ESCALA_AVISO = 0.01;

export type ResultadoDoisPares =
  | { ok: true; vetor: Vec3; graus: number; razaoDistancias: number }
  | { ok: false; motivo: string };

/** Ângulo em graus normalizado para (−180, 180]. */
export function normalizarGraus(graus: number): number {
  const r = ((((graus + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r + 0;
}

export function alinharPorDoisPares(entrada: {
  vetorAtual: Vec3;
  grausAtual: number;
  pivo: Vec3;
  a1: Vec3;
  a2: Vec3;
  b1: Vec3;
  b2: Vec3;
}): ResultadoDoisPares {
  const { vetorAtual, grausAtual, pivo, a1, a2, b1, b2 } = entrada;
  const da: [number, number] = [a2[0] - a1[0], a2[1] - a1[1]];
  const db: [number, number] = [b2[0] - b1[0], b2[1] - b1[1]];
  const ta = Math.hypot(...da);
  const tb = Math.hypot(...db);
  if (ta < DISTANCIA_MINIMA_PAR || tb < DISTANCIA_MINIMA_PAR) {
    return {
      ok: false,
      motivo: "Os dois pontos de cada par precisam estar afastados em planta (mín. 1 cm) para definir o giro.",
    };
  }
  const delta = ((Math.atan2(db[1], db[0]) - Math.atan2(da[1], da[0])) * 180) / Math.PI;
  const base: Vec3 = [pivo[0] + vetorAtual[0] - a1[0], pivo[1] + vetorAtual[1] - a1[1], pivo[2] + vetorAtual[2] - a1[2]];
  const [gx, gy] = girarXY(base, delta);
  return {
    ok: true,
    graus: normalizarGraus(grausAtual + delta),
    vetor: [gx + b1[0] - pivo[0], gy + b1[1] - pivo[1], base[2] + b1[2] - pivo[2]],
    razaoDistancias: tb / ta,
  };
}
