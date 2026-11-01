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

/**
 * Renomear o documento (2026-10-21): o que veio do nome ANTIGO acompanha o nome novo. Um campo
 * vazio, ou igual ao que o nome antigo dizia, passa ao que o nome novo diz; um valor que o nome
 * antigo não explicava (escolha de alguém) fica. Sem leitura confiável do nome novo, nada muda.
 *
 * Antes o renomeio só trocava o nome: `260031-EST-EX-0000-M3D` renomeado para `…-DE-405` ficou com
 * prancha 0 e tipo M3D, e todo envio seguinte esbarrava em `resolverMetadado` ("já tem valor").
 *
 * @returns o valor novo, ou `undefined` para não mexer no campo
 */
export function metadadoAoRenomear<T>(
  atual: T | null | undefined,
  lidoAntes: T | null | undefined,
  lidoDepois: T | null | undefined,
): T | undefined {
  if (lidoDepois == null || lidoDepois === atual) return undefined;
  const vazio = atual == null;
  const veioDoNomeAntigo = lidoAntes != null && atual === lidoAntes;
  return vazio || veioDoNomeAntigo ? lidoDepois : undefined;
}
