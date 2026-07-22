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
