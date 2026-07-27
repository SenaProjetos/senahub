/**
 * Engine E26 — Pré-dimensionamento de sapata quadrada por SPT (correlação de Alonso).
 * Puro. Cargas em kN, tensões em kPa, profundidades em m, dimensões de peça em cm.
 *
 * Método:
 *  1. σadm ≈ N/5 (kgf/cm²) na cota de apoio — Alonso, válido só para N ≤ 20 (fora da faixa: capa e alerta).
 *  2. Área necessária A = FM·Fz/σadm; lado B = √A, arredondado a 10 cm para cima.
 *  3. Verificação do bulbo de tensões (≈ 2B abaixo da cota de apoio): recalcula σadm com o N médio
 *     ponderado do trecho DENTRO do bulbo (do perfil informado) e exige σadm,bulbo ≥ σadm,apoio —
 *     é o caso clássico de camada mole logo abaixo de uma crosta resistente.
 *
 * ESTIMATIVA de anteprojeto. NÃO substitui laudo geotécnico: com σadm/c/φ de ensaio, usar E21/E22.
 */

import { z } from "zod";
import { camadaSptSchema, camadasAteProfundidade, nMedioPonderado } from "./spt-shared";

/** 1 kgf/cm² = 98,0665 kPa. */
const KGFCM2_KPA = 98.0665;
/** Faixa de validade da correlação de Alonso. */
const N_MAX_ALONSO = 20;
/** Teto usual de σadm por correlação de SPT (kgf/cm²). */
const SIGMA_ADM_MAX_KGFCM2 = 2.5;

export const entradaSchema = z.object({
  /** kN — carga vertical característica do pilar. */
  fz: z.number().positive(),
  /** Fator de majoração (peso próprio da sapata + reaterro). */
  fm: z.number().min(1).default(1.05),
  /** m — cota de apoio da sapata (abaixo do nível do terreno). */
  profundidadeM: z.number().positive(),
  /** Perfil de sondagem A PARTIR da cota de apoio, do topo para baixo. */
  camadas: z.array(camadaSptSchema).min(1),
});
export type EntradaSapataSpt = z.infer<typeof entradaSchema>;
export type EntradaSapataSptInput = z.input<typeof entradaSchema>;

export type ResultadoSapataSpt = {
  /** kPa — tensão admissível estimada na cota de apoio. */
  sigmaAdmKpa: number;
  /** N do SPT da camada de apoio (primeira do perfil). */
  nApoio: number;
  /** true = N do apoio excedia 20 e foi capado. */
  capadoN20: boolean;
  /** cm — lado da sapata quadrada. */
  ladoCm: number;
  /** m² — área adotada. */
  areaM2: number;
  /** m — profundidade do bulbo de tensões (2B). */
  bulboM: number;
  /** N médio ponderado dentro do bulbo. */
  nBulbo: number;
  /** kPa — σadm recalculado com o N do bulbo. */
  sigmaAdmBulboKpa: number;
  bulboOk: boolean;
  /** true = a sondagem informada não alcança a profundidade do bulbo. */
  perfilInsuficiente: boolean;
  alertas: string[];
  situacao: "ok" | "revisar";
};

/** σadm de Alonso: N/5 em kgf/cm², capado em `SIGMA_ADM_MAX_KGFCM2`, convertido a kPa. */
function sigmaAdmAlonso(n: number): number {
  return Math.min(n / 5, SIGMA_ADM_MAX_KGFCM2) * KGFCM2_KPA;
}

export function calcular(input: EntradaSapataSptInput): ResultadoSapataSpt {
  const v = entradaSchema.parse(input);
  const alertas: string[] = [];

  const nApoio = v.camadas[0].nspt;
  const capadoN20 = nApoio > N_MAX_ALONSO;
  if (capadoN20) {
    alertas.push(`Correlação de Alonso válida para N ≤ 20; N do apoio (${nApoio}) capado a 20.`);
  }
  const nApoioUsado = Math.min(nApoio, N_MAX_ALONSO);
  const sigmaAdmKpa = sigmaAdmAlonso(nApoioUsado);
  if (nApoioUsado / 5 > SIGMA_ADM_MAX_KGFCM2) {
    alertas.push(
      `σadm limitado ao teto usual de ${SIGMA_ADM_MAX_KGFCM2.toLocaleString("pt-BR")} kgf/cm² para ` +
        "estimativa por SPT — acima disso, exigir ensaio (prova de carga / laudo).",
    );
  }

  // Área e lado da sapata quadrada (kN/kPa = m²).
  const areaReqM2 = (v.fm * v.fz) / sigmaAdmKpa;
  const ladoM = Math.ceil(Math.sqrt(areaReqM2) / 0.1) * 0.1;
  const ladoCm = Math.round(ladoM * 100);
  const areaM2 = (ladoCm / 100) ** 2;

  // Bulbo de tensões ≈ 2B abaixo da cota de apoio.
  const bulboM = 2 * (ladoCm / 100);
  const profundidadePerfil = v.camadas.reduce((s, c) => s + c.espessuraM, 0);
  const perfilInsuficiente = profundidadePerfil < bulboM;
  if (perfilInsuficiente) {
    alertas.push(
      `A sondagem informada cobre ${profundidadePerfil.toFixed(1)} m abaixo da cota de apoio, ` +
        `menos que o bulbo de tensões (${bulboM.toFixed(1)} m): verificação parcial.`,
    );
  }
  const dentro = camadasAteProfundidade(v.camadas, bulboM);
  const nBulbo = nMedioPonderado(dentro);
  const sigmaAdmBulboKpa = sigmaAdmAlonso(Math.min(nBulbo, N_MAX_ALONSO));
  const bulboOk = sigmaAdmBulboKpa >= sigmaAdmKpa * 0.999;
  if (!bulboOk) {
    alertas.push(
      `σadm no bulbo de tensões (${sigmaAdmBulboKpa.toFixed(0)} kPa) < σadm na cota de apoio ` +
        `(${sigmaAdmKpa.toFixed(0)} kPa): redimensionar a base com a tensão do bulbo.`,
    );
  }

  return {
    sigmaAdmKpa,
    nApoio,
    capadoN20,
    ladoCm,
    areaM2,
    bulboM,
    nBulbo,
    sigmaAdmBulboKpa,
    bulboOk,
    perfilInsuficiente,
    alertas,
    situacao: bulboOk ? "ok" : "revisar",
  };
}
