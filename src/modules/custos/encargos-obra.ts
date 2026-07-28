/**
 * Encargos sociais de obra (Grupos A/B/C/D, horista × mensalista, desonerado × não desonerado).
 * PURO, sem I/O — não tem relação com `lib/encargos.ts` (INSS/IRRF progressivo da folha CLT).
 *
 * - Grupo A: encargos básicos que incidem sobre a remuneração (cotas patronais).
 * - Grupo B: tempo não trabalhado remunerado / benefícios (reincide sobre o Grupo A).
 * - Grupo C: verbas rescisórias/indenizatórias (não reincidem sobre A nem recebem incidência dele).
 * - Grupo D: reincidência do Grupo A sobre o Grupo B — **calculado, nunca digitado**.
 *
 * `PRESET_ENCARGOS_SINAPI` é referencial (percentuais usuais de mercado da construção civil) e
 * **editável por orçamento** via `overrides` — a fonte oficial (SINAPI) varia por UF/mês e é
 * publicada à parte; este preset é o ponto de partida, não a fonte de verdade legal.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type GrupoEncargo = "A" | "B" | "C";
export type Coluna = "horista" | "mensalista";
export type RegimeEncargosObra = "desonerado" | "nao_desonerado";

export type RubricaEncargo = {
  codigo: string;
  grupo: GrupoEncargo;
  descricao: string;
  horista: number;
  mensalista: number;
  /** Zerada no regime desonerado (cota patronal INSS, substituída pela CPRB — cobrada no BDI, não aqui). */
  desoneravel?: boolean;
  /** Só relevante em rubricas do Grupo B: entra na base do Grupo D. Default true. */
  reincideGrupoA?: boolean;
};

export const PRESET_ENCARGOS_SINAPI: RubricaEncargo[] = [
  // Grupo A — cotas patronais sobre a remuneração
  { codigo: "A1", grupo: "A", descricao: "INSS (cota patronal)", horista: 20.0, mensalista: 20.0, desoneravel: true },
  { codigo: "A2", grupo: "A", descricao: "SESI", horista: 1.5, mensalista: 1.5 },
  { codigo: "A3", grupo: "A", descricao: "SENAI", horista: 1.0, mensalista: 1.0 },
  { codigo: "A4", grupo: "A", descricao: "INCRA", horista: 0.2, mensalista: 0.2 },
  { codigo: "A5", grupo: "A", descricao: "SEBRAE", horista: 0.6, mensalista: 0.6 },
  { codigo: "A6", grupo: "A", descricao: "Salário-educação", horista: 2.5, mensalista: 2.5 },
  { codigo: "A7", grupo: "A", descricao: "Seguro acidente de trabalho (RAT/SAT)", horista: 3.0, mensalista: 3.0 },
  { codigo: "A8", grupo: "A", descricao: "FGTS", horista: 8.0, mensalista: 8.0 },
  // Grupo B — tempo não trabalhado remunerado (reincide sobre A)
  { codigo: "B1", grupo: "B", descricao: "Repouso semanal remunerado", horista: 17.86, mensalista: 0, reincideGrupoA: true },
  { codigo: "B2", grupo: "B", descricao: "13º salário", horista: 10.85, mensalista: 10.85, reincideGrupoA: true },
  { codigo: "B3", grupo: "B", descricao: "Férias gozadas + 1/3", horista: 11.51, mensalista: 11.51, reincideGrupoA: true },
  { codigo: "B4", grupo: "B", descricao: "Auxílio-enfermidade (primeiros 15 dias)", horista: 0.87, mensalista: 0.87, reincideGrupoA: true },
  { codigo: "B5", grupo: "B", descricao: "Feriados", horista: 3.85, mensalista: 0, reincideGrupoA: true },
  { codigo: "B6", grupo: "B", descricao: "Faltas justificadas", horista: 0.71, mensalista: 0.71, reincideGrupoA: true },
  // Grupo C — verbas rescisórias/indenizatórias (não reincidem)
  { codigo: "C1", grupo: "C", descricao: "Aviso prévio indenizado", horista: 4.34, mensalista: 4.34 },
  { codigo: "C2", grupo: "C", descricao: "Férias indenizadas + 1/3 (rescisão)", horista: 3.09, mensalista: 3.09 },
  { codigo: "C3", grupo: "C", descricao: "Multa rescisória do FGTS (40%)", horista: 4.86, mensalista: 4.86 },
];

export type OverrideEncargo = { codigo: string; horista?: number; mensalista?: number };

export type EntradaEncargos = {
  regime: RegimeEncargosObra;
  /** Default `PRESET_ENCARGOS_SINAPI`. */
  preset?: RubricaEncargo[];
  overrides?: OverrideEncargo[];
};

export type LinhaEncargo = {
  codigo: string;
  grupo: GrupoEncargo;
  descricao: string;
  /** Valor efetivo já com override e desoneração aplicados. */
  horista: number;
  mensalista: number;
  zeradaPeloRegime: boolean;
};

export type ResultadoEncargos =
  | {
      ok: true;
      grupoA: number;
      grupoBHorista: number;
      grupoBMensalista: number;
      grupoC: number;
      grupoDHorista: number;
      grupoDMensalista: number;
      totalHorista: number;
      totalMensalista: number;
      linhas: LinhaEncargo[];
    }
  | { ok: false; erro: string };

/** Calcula os encargos sociais de obra por grupo (A/B/C/D) × coluna (horista/mensalista). */
export function calcularEncargos(entrada: EntradaEncargos): ResultadoEncargos {
  const preset = entrada.preset ?? PRESET_ENCARGOS_SINAPI;
  const overrides = entrada.overrides ?? [];

  const codigosPreset = new Set(preset.map((r) => r.codigo));
  for (const o of overrides) {
    if (!codigosPreset.has(o.codigo)) {
      return { ok: false, erro: `Rubrica "${o.codigo}" não existe no preset de encargos.` };
    }
  }
  const overridesPorCodigo = new Map(overrides.map((o) => [o.codigo, o]));

  const linhas: LinhaEncargo[] = preset.map((r) => {
    const ov = overridesPorCodigo.get(r.codigo);
    const zerada = entrada.regime === "desonerado" && r.desoneravel === true;
    const horista = zerada ? 0 : ov?.horista ?? r.horista;
    const mensalista = zerada ? 0 : ov?.mensalista ?? r.mensalista;
    return { codigo: r.codigo, grupo: r.grupo, descricao: r.descricao, horista, mensalista, zeradaPeloRegime: zerada };
  });

  const somaGrupo = (grupo: GrupoEncargo, coluna: Coluna) =>
    linhas.filter((l) => l.grupo === grupo).reduce((acc, l) => acc + l[coluna], 0);

  const somaGrupoBReincidente = (coluna: Coluna) =>
    preset
      .filter((r) => r.grupo === "B" && r.reincideGrupoA !== false)
      .reduce((acc, r) => {
        const linha = linhas.find((l) => l.codigo === r.codigo)!;
        return acc + linha[coluna];
      }, 0);

  const grupoA = round2(somaGrupo("A", "horista")); // A é igual nas duas colunas no preset atual
  const grupoBHorista = round2(somaGrupo("B", "horista"));
  const grupoBMensalista = round2(somaGrupo("B", "mensalista"));
  const grupoC = round2(somaGrupo("C", "horista"));

  const grupoDHorista = round2((grupoA * somaGrupoBReincidente("horista")) / 100);
  const grupoDMensalista = round2((grupoA * somaGrupoBReincidente("mensalista")) / 100);

  const totalHorista = round2(grupoA + grupoBHorista + grupoC + grupoDHorista);
  const totalMensalista = round2(grupoA + grupoBMensalista + grupoC + grupoDMensalista);

  return {
    ok: true,
    grupoA,
    grupoBHorista,
    grupoBMensalista,
    grupoC,
    grupoDHorista,
    grupoDMensalista,
    totalHorista,
    totalMensalista,
    linhas,
  };
}
