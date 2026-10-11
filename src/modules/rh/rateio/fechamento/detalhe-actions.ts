"use server";

import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { podeVerCusto } from "@/lib/custo-visivel";
import { detalheDoMes, type DetalheDoMes } from "@/modules/rh/rateio/fechamento/queries";

/**
 * Detalhe de um mês da tela do rateio. Leitura, fora do `defineAction` (como `buscarProjetosPonto`);
 * o gate é o da tela — `ponto:rateio` — e os reais só saem para quem vê custo.
 */
export async function buscarDetalheDoMesRateio(ano: number, mes: number): Promise<DetalheDoMes | null> {
  const user = (await getSession())?.user;
  if (!user || !user.ativo || user.tipo !== "interno") return null;
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12 || ano < 2000 || ano > 2100) return null;
  if (!(await can(user, "ponto", "rateio"))) return null;
  return detalheDoMes(ano, mes, await podeVerCusto(user));
}
