"use server";

import { getSession } from "@/lib/session";
import { expedienteDeHoje, type ExpedienteDoHero } from "@/modules/dashboard/hero/queries";

/**
 * Releitura da linha do expediente do herocard (só leitura, sem auditoria — como
 * `buscarResumoJornada`). O card chama depois de cada batida (`EVENTO_PONTO`) e quando a aba volta
 * a ficar visível; entre uma e outra, o tempo corre no navegador.
 */
export async function buscarExpedienteDoHero(): Promise<ExpedienteDoHero | null> {
  const session = await getSession();
  const user = session?.user;
  if (!user || !user.ativo || user.tipo !== "interno") return null;
  return expedienteDeHoje({ id: user.id, tipo: user.tipo, contratacao: user.contratacao });
}
