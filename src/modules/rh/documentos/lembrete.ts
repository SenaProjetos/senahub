import "server-only";

import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { whereAudiencia } from "@/lib/audiencias";
import { faixaParaAvisar, TIPO_DOC_LABEL, textoDaFaixa, type TipoDoc } from "./regras";

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Aviso de documento vencendo (F5): 60, 30 e 7 dias antes e quando vence — uma vez por faixa,
 * reivindicada com `updateMany` condicionado à faixa lida. Vai à pessoa e ao RH; coordenador não
 * recebe (decisão do dono: vencido só alerta, não bloqueia responsabilidade técnica).
 */
export async function avisarDocumentosVencendo(hoje: Date): Promise<number> {
  const dia = ymd(hoje)!;
  const docs = await prisma.funcionarioDocumento.findMany({
    where: { validadeEm: { not: null }, user: { ativo: true } },
    select: { id: true, userId: true, tipo: true, nome: true, validadeEm: true, avisoFaixa: true, user: { select: { name: true } } },
  });
  const rh = (await prisma.user.findMany({ where: whereAudiencia("rh_admin"), select: { id: true } })).map((u) => u.id);
  let avisados = 0;
  for (const d of docs) {
    const faixa = faixaParaAvisar(ymd(d.validadeEm), dia, d.avisoFaixa);
    if (faixa == null) continue;
    const r = await prisma.funcionarioDocumento.updateMany({ where: { id: d.id, avisoFaixa: d.avisoFaixa }, data: { avisoFaixa: faixa } });
    if (r.count !== 1) continue;
    const tipo = TIPO_DOC_LABEL[d.tipo as TipoDoc] ?? d.tipo;
    const quando = `${textoDaFaixa(faixa)} (${ymd(d.validadeEm)!.split("-").reverse().join("/")})`;
    await notificarMuitos(
      [d.userId],
      { titulo: `Seu documento ${tipo} ${textoDaFaixa(faixa)}`, corpo: `${d.nome} ${quando}. Envie o novo em Minha conta.`, href: "/minha-ficha", tag: `doc-validade-${d.id}` },
      { categoria: "documento_validade" },
    );
    await notificarMuitos(
      rh.filter((id) => id !== d.userId),
      { titulo: `${tipo} de ${d.user.name} ${textoDaFaixa(faixa)}`, corpo: `${d.nome} ${quando}.`, href: `/rh/pessoas/${d.userId}`, tag: `doc-validade-${d.id}` },
      { categoria: "documento_validade" },
    );
    avisados++;
  }
  return avisados;
}
