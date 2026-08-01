import "server-only";
import { prisma } from "@/lib/prisma";
import { espelhoMes } from "@/modules/ponto/queries";
import { acumuladoAte, usuariosComJornadaNoMes } from "@/modules/rh/banco/queries";

/**
 * Regra de fechamento do banco de horas — compartilhada pela Server Action
 * (`actions.ts`) e pelo job mensal (`lib/jobs-handlers.ts`), que antes tinham
 * cópias divergentes do mesmo laço.
 */

/**
 * Fecha (ou refecha) o banco de horas de um mês. Idempotente — upsert por
 * `userId+ano+mes`, seguro rodar quantas vezes quiser.
 *
 * O acumulado vem de `acumuladoAte`, que pega o fechamento anterior MAIS RECENTE
 * em vez do mês imediatamente anterior: um mês não fechado no meio do caminho
 * zerava a cadeia silenciosamente e o colaborador perdia todo o saldo anterior.
 */
export async function fecharBancoDoMes(ano: number, mes: number): Promise<number> {
  const usuarios = await usuariosComJornadaNoMes(ano, mes);

  let fechados = 0;
  for (const { id: userId } of usuarios) {
    const esp = await espelhoMes(userId, ano, mes);
    const anterior = await acumuladoAte(userId, ano, mes);
    const acumulado = (anterior?.acumuladoMinutos ?? 0) + esp.saldoMinutos;
    await prisma.bancoHorasMensal.upsert({
      where: { userId_ano_mes: { userId, ano, mes } },
      create: { userId, ano, mes, saldoMinutos: esp.saldoMinutos, acumuladoMinutos: acumulado },
      update: { saldoMinutos: esp.saldoMinutos, acumuladoMinutos: acumulado, fechadoEm: new Date() },
    });
    fechados++;
  }
  return fechados;
}

/**
 * Recalcula os meses que já têm fechamento, do mais antigo para o mais recente.
 * A ordem é obrigatória: o acumulado de cada mês parte do fechamento anterior,
 * então recalcular fora de ordem propagaria o valor velho.
 *
 * Só toca meses que JÁ FORAM fechados — não inventa histórico para meses que
 * ninguém fechou. As lacunas continuam cobertas por `acumuladoAte`.
 *
 * A JANELA é obrigatória e limitada (`MAX_MESES_RECALCULO`): cada mês custa
 * ~12 queries por colaborador, sequenciais. Recalcular dois anos de uma equipe
 * inteira numa única Server Action estouraria o tempo da requisição e deixaria
 * a cadeia de acumulado pela metade. Recalcule em blocos, do mais antigo para
 * o mais novo.
 */
export const MAX_MESES_RECALCULO = 6;

export async function recalcularHistoricoBanco(
  anoIni: number,
  mesIni: number,
): Promise<{ meses: number; linhas: number; ate: { ano: number; mes: number } | null }> {
  const periodos = await prisma.bancoHorasMensal.findMany({
    where: { OR: [{ ano: { gt: anoIni } }, { ano: anoIni, mes: { gte: mesIni } }] },
    distinct: ["ano", "mes"],
    orderBy: [{ ano: "asc" }, { mes: "asc" }],
    select: { ano: true, mes: true },
    take: MAX_MESES_RECALCULO,
  });

  let linhas = 0;
  for (const p of periodos) linhas += await fecharBancoDoMes(p.ano, p.mes);
  return { meses: periodos.length, linhas, ate: periodos.at(-1) ?? null };
}
