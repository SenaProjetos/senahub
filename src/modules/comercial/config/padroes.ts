/**
 * Parâmetros configuráveis do Comercial: defaults e leitura defensiva do JSON (F1.7).
 *
 * Puro — sem I/O, sem Prisma. O acesso ao banco fica em `queries.ts`; aqui mora o que decide
 * qual número vale, que é a parte que erra em silêncio e por isso é testada.
 *
 * O objetivo da tarefa é que NENHUM destes números apareça solto no código do módulo: quem
 * precisar de um limiar chama a query, nunca escreve `15` no meio de uma regra.
 */

export type ConfigComercial = {
  /** Desconto (%) acima do qual a UI exige justificativa registrada. Q6/ADR-19. */
  descontoMaxSemJustificativa: number;
  /** Dias sem interação para a prospecção/negociação ser sinalizada como parada. */
  diasSemContato: number;
  /** Antecedência (dias) do aviso de proposta prestes a vencer. */
  diasAvisoValidadeProposta: number;
  /** Dias sem nova contratação para o cliente entrar na lista de reativação. */
  diasClienteInativo: number;
};

/**
 * Valores iniciais. `descontoMaxSemJustificativa: 10` vem da decisão Q6 (01-decisoes.md).
 * Os outros três são pontos de partida operacionais, escolhidos para serem visivelmente
 * conservadores — a intenção é que sejam ajustados na tela conforme o ritmo real do time, e é
 * justamente por isso que vivem em configuração e não no código.
 */
export const CONFIG_COMERCIAL_PADRAO: ConfigComercial = {
  descontoMaxSemJustificativa: 10,
  diasSemContato: 15,
  diasAvisoValidadeProposta: 7,
  diasClienteInativo: 180,
};

/**
 * Lê um número do JSON de configuração, caindo no default quando o valor é ausente, de outro
 * tipo, negativo, `NaN` ou infinito.
 *
 * Rejeitar negativo importa: `diasSemContato: -5` não é "config exótica", é uma regra que nunca
 * dispara — e falharia silenciosamente, que é o pior modo de falha para um alerta.
 */
function numero(valor: unknown, padrao: number): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return padrao;
  return valor;
}

/**
 * Constrói a config a partir do JSON cru do `ConfigSistema`, campo a campo — um valor inválido
 * derruba só o próprio campo para o default, nunca o objeto inteiro.
 */
export function parseConfigComercial(valor: unknown): ConfigComercial {
  if (typeof valor !== "object" || valor === null) return CONFIG_COMERCIAL_PADRAO;
  const v = valor as Record<string, unknown>;
  return {
    descontoMaxSemJustificativa: numero(
      v.descontoMaxSemJustificativa,
      CONFIG_COMERCIAL_PADRAO.descontoMaxSemJustificativa,
    ),
    diasSemContato: numero(v.diasSemContato, CONFIG_COMERCIAL_PADRAO.diasSemContato),
    diasAvisoValidadeProposta: numero(
      v.diasAvisoValidadeProposta,
      CONFIG_COMERCIAL_PADRAO.diasAvisoValidadeProposta,
    ),
    diasClienteInativo: numero(v.diasClienteInativo, CONFIG_COMERCIAL_PADRAO.diasClienteInativo),
  };
}

/**
 * Um desconto exige justificativa registrada? (Q6)
 *
 * Compara com `>`, não `>=`: o limite configurado é o teto do que passa livre. Com 10%, um
 * desconto de exatamente 10% NÃO exige justificativa; 10,01% exige.
 */
export function exigeJustificativaDesconto(
  descontoPercentual: number,
  config: ConfigComercial,
): boolean {
  return descontoPercentual > config.descontoMaxSemJustificativa;
}
