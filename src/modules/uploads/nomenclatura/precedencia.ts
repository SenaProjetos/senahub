/**
 * Precedência de metadado no envio (ADR-0003, regra 2) — pura, para ser testável fora da rota.
 *
 *   escolha manual (diálogo) > valor que o documento JÁ tem > leitura do nome
 *
 * A leitura do nome só preenche vazio: nunca apaga nem sobrescreve classificação anterior, seja
 * ela manual ou de um envio passado. Escolha manual sempre grava — é a pessoa decidindo agora.
 */

export type OrigemMetadado = "manual" | "nome";

export type CampoResolvido<T> = { valor: T; origem: OrigemMetadado };

/**
 * `undefined` = não mexe neste campo (o `update` do Prisma nem recebe a chave, então o valor
 * atual fica como está).
 *
 * @param manual  o que veio do diálogo (já validado contra o catálogo do projeto)
 * @param lido    o que o motor leu do nome, SÓ quando a confiança é alta (D7)
 * @param jaTem   o valor atual do documento; `null`/`undefined` = ainda sem classificação
 */
export function resolverMetadado<T>(
  manual: T | null | undefined,
  lido: T | null | undefined,
  jaTem: unknown,
): CampoResolvido<T> | undefined {
  if (manual != null) return { valor: manual, origem: "manual" };
  if (lido != null && jaTem == null) return { valor: lido, origem: "nome" };
  return undefined;
}
