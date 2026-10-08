import "server-only";

import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/notificar";
import { deveLembrar, proximoUmAUm } from "./regras";

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Lembrete de 1:1 atrasado (F3), para o líder. No máximo um a cada 7 dias por liderado: cada
 * liderança é REIVINDICADA com `updateMany` condicionado ao `lembradoEm` lido. A notificação nunca
 * carrega conteúdo do 1:1 — só o nome e há quanto tempo.
 */
export async function lembrarUmAUmAtrasado(hoje: Date): Promise<number> {
  const dia = ymd(hoje)!;
  const ativas = await prisma.liderancaPessoa.findMany({
    where: { fim: null },
    select: { id: true, liderId: true, userId: true, inicio: true, cadenciaDias: true, lembradoEm: true, liderado: { select: { name: true } } },
  });
  let enviados = 0;
  for (const l of ativas) {
    if (!deveLembrar(ymd(l.lembradoEm), dia)) continue;
    const ultimo = await prisma.encontroUmAUm.findFirst({ where: { userId: l.userId }, orderBy: { data: "desc" }, select: { data: true, proximoEm: true } });
    const prox = proximoUmAUm(ultimo ? { data: ymd(ultimo.data)!, proximoEm: ymd(ultimo.proximoEm) } : null, ymd(l.inicio)!, l.cadenciaDias, dia);
    if (!prox.vencido) continue;
    const r = await prisma.liderancaPessoa.updateMany({
      where: { id: l.id, fim: null, lembradoEm: l.lembradoEm },
      data: { lembradoEm: hoje },
    });
    if (r.count !== 1) continue;
    await notificar(
      l.liderId,
      {
        titulo: `1:1 atrasado com ${l.liderado.name}`,
        corpo: `O encontro estava previsto até ${prox.em.slice(8, 10)}/${prox.em.slice(5, 7)}. Registre o próximo em Minha equipe.`,
        href: `/rh/minha-equipe/${l.userId}`,
        tag: `um-a-um-${l.userId}`,
      },
      { categoria: "desenvolvimento" },
    );
    enviados++;
  }
  return enviados;
}
