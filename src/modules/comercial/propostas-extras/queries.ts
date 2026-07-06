import "server-only";
import { prisma } from "@/lib/prisma";

// anexosDaProposta migrou para `modules/documentos-cliente/queries.ts` (documentosDaProposta),
// pois os anexos viraram Documento (ancorado no cliente). Aqui fica só a comparação de versões.

type SnapItem = { disciplina?: string; valor?: number | string };

/** Versões da proposta com itens/total extraídos do snapshot, para comparação (C3). */
export async function versoesComparaveis(propostaId: string) {
  const vs = await prisma.propostaVersao.findMany({
    where: { propostaId },
    orderBy: { numero: "desc" },
    include: { autor: { select: { name: true } } },
  });
  return vs.map((v) => {
    const s = (v.snapshot ?? {}) as { titulo?: string; itens?: SnapItem[] };
    const itens = Array.isArray(s.itens) ? s.itens : [];
    const norm = itens.map((it) => ({ disciplina: String(it.disciplina ?? "—"), valor: Number(it.valor ?? 0) }));
    const total = norm.reduce((a, it) => a + it.valor, 0);
    return { numero: v.numero, autor: v.autor.name, data: v.createdAt.toISOString(), titulo: s.titulo ?? "", itens: norm, total };
  });
}
