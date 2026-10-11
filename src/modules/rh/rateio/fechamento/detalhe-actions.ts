"use server";

import { getSession } from "@/lib/session";
import { can, canRole } from "@/lib/permissions";
import { podeVerCusto } from "@/lib/custo-visivel";
import { detalheDoMes, type DetalheDoMes } from "@/modules/rh/rateio/fechamento/queries";

/**
 * Detalhe de um mês da tela do rateio. Leitura, fora do `defineAction` (como `buscarProjetosPonto`);
 * o gate é o MESMO da página (`requirePermission("ponto", "rateio")`, com o piso de leitura do sócio)
 * — senão o sócio abriria a tela e o "Ver detalhes" voltaria vazio. Os reais só saem para quem vê custo.
 */
export async function buscarDetalheDoMesRateio(ano: number, mes: number): Promise<DetalheDoMes | null> {
  const user = (await getSession())?.user;
  if (!user || !user.ativo || user.tipo !== "interno") return null;
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12 || ano < 2000 || ano > 2100) return null;
  const pode = (await can(user, "ponto", "rateio")) || (user.ehSocio && (await canRole("supervisor", "ponto", "rateio")));
  if (!pode) return null;
  return detalheDoMes(ano, mes, await podeVerCusto(user));
}
