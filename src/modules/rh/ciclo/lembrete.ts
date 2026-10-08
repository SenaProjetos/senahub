import "server-only";

import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { whereAudiencia, wherePermissao } from "@/lib/audiencias";
import { responsavelEfetivo, TIPO_CICLO_LABEL } from "./regras";

/** Onde cada destinatário marca o item: RH na fila, TI na tela da TI, a pessoa em Minha conta. */
const HREF = { rh: "/rh/admin", ti: "/patrimonio/ti", pessoa: "/minha-ficha" } as const;

/**
 * Lembrete diário de itens de entrada/saída atrasados (Gestão de Pessoas F4, decisão "dono + RH").
 *
 * Uma vez por item por dia: cada item é REIVINDICADO com `updateMany` condicionado a
 * `lembradoEm < hoje` (count ≠ 1 = outra execução já levou), e só os reivindicados entram no aviso.
 * Cada destinatário recebe UMA notificação com a contagem, não uma por item. Líder e coordenador
 * ficam com o RH até a F3; o RH recebe tudo.
 *
 * `hoje` = meia-noite UTC do dia (colunas `@db.Date`).
 */
export async function lembrarItensCicloAtrasados(hoje: Date): Promise<{ itens: number; destinatarios: number }> {
  const candidatos = await prisma.onboardingItem.findMany({
    where: {
      concluido: false,
      prazoEm: { lt: hoje },
      processo: { status: "em_andamento" },
      OR: [{ lembradoEm: null }, { lembradoEm: { lt: hoje } }],
    },
    select: {
      id: true,
      descricao: true,
      responsavel: true,
      processo: { select: { tipo: true, userId: true, user: { select: { name: true } } } },
    },
  });

  const lembrados: typeof candidatos = [];
  for (const it of candidatos) {
    const r = await prisma.onboardingItem.updateMany({
      where: { id: it.id, concluido: false, OR: [{ lembradoEm: null }, { lembradoEm: { lt: hoje } }] },
      data: { lembradoEm: hoje },
    });
    if (r.count === 1) lembrados.push(it);
  }
  if (lembrados.length === 0) return { itens: 0, destinatarios: 0 };

  const [rh, ti] = await Promise.all([
    prisma.user.findMany({ where: whereAudiencia("rh_admin"), select: { id: true } }),
    lembrados.some((l) => responsavelEfetivo(l.responsavel) === "ti")
      ? prisma.user.findMany({ where: wherePermissao("patrimonio", "ti"), select: { id: true } })
      : Promise.resolve([]),
  ]);
  const idsRh = new Set(rh.map((u) => u.id));

  // destinatário → itens dele (o RH vê todos; TI e a pessoa, os seus) + para onde ir.
  const porDestino = new Map<string, { itens: typeof lembrados; href: string }>();
  const anotar = (userId: string, item: (typeof lembrados)[number], href: string) => {
    const atual = porDestino.get(userId) ?? { itens: [], href };
    atual.itens.push(item);
    // Quem também é do RH vai para a fila do RH, que mostra tudo.
    if (idsRh.has(userId)) atual.href = HREF.rh;
    porDestino.set(userId, atual);
  };
  for (const item of lembrados) {
    for (const u of idsRh) anotar(u, item, HREF.rh);
    const dono = responsavelEfetivo(item.responsavel);
    if (dono === "ti") for (const u of ti) anotar(u.id, item, HREF.ti);
    if (dono === "pessoa") anotar(item.processo.userId, item, HREF.pessoa);
  }

  const dia = hoje.toISOString().slice(0, 10);
  for (const [userId, { itens, href }] of porDestino) {
    const n = itens.length;
    const exemplos = itens
      .slice(0, 3)
      .map((i) => `${i.processo.user.name} (${TIPO_CICLO_LABEL[i.processo.tipo].toLowerCase()}): ${i.descricao}`)
      .join(" · ");
    await notificarMuitos(
      [userId],
      {
        titulo: n === 1 ? "1 item de entrada/saída atrasado" : `${n} itens de entrada/saída atrasados`,
        corpo: n > 3 ? `${exemplos} · e mais ${n - 3}` : exemplos,
        href,
        tag: `ciclo-atraso-${dia}`,
      },
      { categoria: "lifecycle_rh" },
    );
  }
  return { itens: lembrados.length, destinatarios: porDestino.size };
}
