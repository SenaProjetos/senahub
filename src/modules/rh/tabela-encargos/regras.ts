/** Regras da tabela de encargos versionada (decisão 2). PURO; datas em `AAAA-MM`. */

const mesTexto = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

/**
 * Uma versão só sai se a contratação continua com tabela e se nenhum mês fechado no cálculo novo a
 * usou (meses de `vigencia` até antes da versão seguinte). Mudar valores = versão nova.
 */
export function motivoParaNaoExcluirVersao(p: { vigencia: string; vigenciasDaContratacao: string[]; mesesFechadosV2: string[] }): string | null {
  if (p.vigenciasDaContratacao.length <= 1) return "É a única versão desta contratação. Crie outra antes de excluir esta.";
  const seguinte = [...p.vigenciasDaContratacao].sort().find((v) => v > p.vigencia) ?? "9999-12";
  const usado = [...p.mesesFechadosV2].sort().find((m) => m >= p.vigencia && m < seguinte);
  if (usado) return `Esta versão foi usada no fechamento de ${mesTexto(usado)}. Para mudar valores, crie uma versão nova.`;
  return null;
}

/**
 * Versão nova só pode começar DEPOIS do último mês já fechado no cálculo novo: começar antes
 * mudaria o custo de um mês congelado.
 */
export function motivoParaNaoCriarVersao(p: { vigencia: string; mesesFechadosV2: string[] }): string | null {
  const ultimo = [...p.mesesFechadosV2].sort().at(-1);
  if (ultimo && p.vigencia <= ultimo) {
    return `O mês ${mesTexto(ultimo)} já foi fechado. A versão nova precisa começar depois do último mês fechado.`;
  }
  return null;
}
