import type { Prisma } from "@/generated/prisma/client";

/**
 * Gera o próximo código sequencial AAXXXX do ano dentro de uma transação.
 * AA = ano com 2 dígitos, XXXX = sequencial zero-padded.
 * A tabela ProjetoSequencia garante atomicidade (sem corrida).
 */
export async function proximoCodigoProjeto(
  tx: Prisma.TransactionClient,
  ano = new Date().getFullYear(),
): Promise<{ ano: number; sequencial: number; codigo: string }> {
  const seq = await tx.projetoSequencia.upsert({
    where: { ano },
    create: { ano, ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  });
  const sequencial = seq.ultimo;
  const codigo = `${String(ano % 100).padStart(2, "0")}${String(sequencial).padStart(4, "0")}`;
  return { ano, sequencial, codigo };
}

/** Item 25 (beta): exibe o código cru (260142), sem o hífen do formato antigo. */
export function formatarCodigo(codigo: string): string {
  return codigo;
}
