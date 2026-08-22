/**
 * Regras puras de versionamento de proposta (F5.4, ADR-05). Sem I/O.
 *
 * Existe separado porque duas coisas que parecem triviais são exatamente as que apodrecem em
 * silêncio: qual versão é a vigente, e como o trio de valores se relaciona. Ter as duas em
 * funções testadas impede que cada tela responda por conta própria.
 */

/**
 * Versão VIGENTE é sempre a de maior `numero` — DERIVADA, nunca uma flag persistida (ADR-05).
 *
 * Uma coluna `vigente: Boolean` exigiria desmarcar a anterior a cada salvamento; duas linhas
 * marcadas (ou nenhuma) seriam um estado impossível de distinguir de "ainda não salvou", e
 * corrigi-lo depois exigiria adivinhar qual das duas era a certa. Derivar não tem esse estado.
 *
 * Devolve `null` para lista vazia — proposta recém-criada ainda não tem versão nenhuma, e isso
 * é normal (a v1 nasce no primeiro `salvarProposta`).
 */
export function versaoVigente<T extends { numero: number }>(versoes: readonly T[]): T | null {
  if (versoes.length === 0) return null;
  return versoes.reduce((maior, v) => (v.numero > maior.numero ? v : maior));
}

/** Próximo número da sequência de versões desta proposta. A v1 é a primeira. */
export function proximoNumeroVersao(versoes: readonly { numero: number }[]): number {
  return (versaoVigente(versoes)?.numero ?? 0) + 1;
}

export type ValoresVersao = {
  /** Soma dos itens — o valor cheio, antes de qualquer abatimento. */
  valorOriginal: number;
  /** Abatimento concedido, em VALOR. `null` = nenhum desconto nesta versão. */
  desconto: number | null;
  /** O que o cliente paga nesta versão: `valorOriginal - desconto`. */
  valorVersao: number;
};

/**
 * O trio de valores de uma versão, a partir dos itens e do desconto.
 *
 * **`valorOriginal` é "de tabela, antes do abatimento" — NÃO é "o valor da v1".** As duas
 * leituras são plausíveis lendo só o nome do campo, e escolher errado envenena a F5.8 (que
 * valida "desconto acima de 10%" contra este valor) e a Fase 6. A leitura de baseline foi
 * descartada por dois motivos: quebraria se a v1 fosse removida, e "valor original" no
 * vocabulário comercial significa preço cheio, não "o primeiro que digitamos".
 *
 * Desconto é guardado em VALOR, não em percentual: o percentual é derivado
 * (`desconto / valorOriginal`), e persistir o derivado abre espaço para os dois discordarem.
 */
export function calcularValoresVersao(
  itens: readonly { valor: number }[],
  desconto: number | null = null,
): ValoresVersao {
  const valorOriginal = itens.reduce((s, it) => s + it.valor, 0);
  const abatimento = desconto != null && desconto > 0 ? desconto : null;
  return {
    valorOriginal,
    desconto: abatimento,
    valorVersao: valorOriginal - (abatimento ?? 0),
  };
}

/**
 * Percentual de desconto de uma versão, 0–100. `null` quando não há desconto ou quando o valor
 * original é zero (dividir por zero daria `Infinity`, que viraria "∞%" na tela).
 *
 * É a conta que a F5.8 usa para comparar com o limite do `ConfigSistema`.
 */
export function percentualDesconto(v: Pick<ValoresVersao, "valorOriginal" | "desconto">): number | null {
  if (v.desconto == null || v.valorOriginal <= 0) return null;
  return (v.desconto / v.valorOriginal) * 100;
}
