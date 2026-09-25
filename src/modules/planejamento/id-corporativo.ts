import type { Prisma, TipoEap } from "@/generated/prisma/client";

/**
 * ID corporativo da linha da EAP (`ATV-01842`) — a IDENTIDADE permanente: única na empresa, atribuída
 * na criação e nunca reaproveitada (D29). Não confundir com o código da EAP (`3.2.4`, posição) nem com
 * o tipo de atividade (o que compara projetos).
 *
 * O prefixo é o tipo da linha NO MOMENTO da criação (mesma regra do backfill da F0); trocar
 * atividade↔marco depois não muda o ID. O contador de cada prefixo (`EapSequencia`) só anda para a
 * frente: número consumido e não usado (linha que não chegou a ser criada) não volta.
 */

/** Só o pedaço do Prisma usado aqui: o `tx` de uma transação ou o próprio `prisma`. */
export type ClienteSequenciaEap = Pick<Prisma.TransactionClient, "eapSequencia">;

export function formatarIdCorporativo(prefixo: string, numero: number): string {
  return `${prefixo}-${String(numero).padStart(5, "0")}`;
}

export function prefixoDoTipo(tipo: TipoEap): string {
  return tipo.toUpperCase();
}

/**
 * Reserva um ID para cada linha de `tipos`, na mesma ordem. Um incremento atômico por prefixo, então
 * duas criações ao mesmo tempo nunca recebem o mesmo número. Chame DENTRO da transação que cria as
 * linhas quando ela existe: o lock da linha do contador segura quem chega junto até o commit.
 */
export async function reservarIdsParaLinhas(
  cliente: ClienteSequenciaEap,
  tipos: readonly TipoEap[],
): Promise<string[]> {
  const total = new Map<TipoEap, number>();
  for (const t of tipos) total.set(t, (total.get(t) ?? 0) + 1);

  const proximos = new Map<TipoEap, number>();
  for (const [tipo, quantidade] of total) {
    const prefixo = prefixoDoTipo(tipo);
    const seq = await cliente.eapSequencia.upsert({
      where: { prefixo },
      create: { prefixo, ultimo: quantidade },
      update: { ultimo: { increment: quantidade } },
    });
    proximos.set(tipo, seq.ultimo - quantidade + 1);
  }

  return tipos.map((tipo) => {
    const numero = proximos.get(tipo)!;
    proximos.set(tipo, numero + 1);
    return formatarIdCorporativo(prefixoDoTipo(tipo), numero);
  });
}
