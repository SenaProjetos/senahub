/**
 * Tipo da folha CLT — puro, serve servidor e cliente. Dezembro tem a folha mensal e a de 13º no
 * mesmo mês (PDFs separados do contador), por isso `FolhaPagamento` é única por (ano, mes, tipo).
 */

export const TIPOS_FOLHA = ["mensal", "decimo_terceiro"] as const;
export type TipoFolha = (typeof TIPOS_FOLHA)[number];

export const ROTULO_TIPO_FOLHA: Record<TipoFolha, string> = {
  mensal: "Mensal",
  decimo_terceiro: "13º salário",
};

/** "07/2026" ou "13º salário 12/2026". */
export function rotuloFolha(f: { ano: number; mes: number; tipo: TipoFolha }): string {
  const mmaaaa = `${String(f.mes).padStart(2, "0")}/${f.ano}`;
  return f.tipo === "mensal" ? mmaaaa : `${ROTULO_TIPO_FOLHA[f.tipo]} ${mmaaaa}`;
}

/**
 * Descrição de rubrica que indica 13º salário ("13º Salário", "INSS 13º", "Adiantamento 13o
 * salário", "Décimo terceiro", "Gratificação natalina"). Heurística escrita SEM ter visto um PDF
 * de 13º do contador (nenhum disponível em 2026-09-13) — é a trava contra importar o PDF de 13º
 * na folha mensal (ou o contrário). Revisar contra o primeiro PDF real.
 */
const RE_DECIMO_TERCEIRO = /(?:^|\D)13\s*[º°ª]|(?:^|\D)13\s*o?\s+sal|d[ée]cimo\s*terceiro|natalin|grat\w*\.?\s*nat/i;

export function pareceDecimoTerceiro(descricao: string): boolean {
  return RE_DECIMO_TERCEIRO.test(descricao);
}
