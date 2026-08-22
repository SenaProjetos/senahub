import "server-only";
import { prisma } from "@/lib/prisma";

// anexosDaProposta migrou para `modules/documentos-cliente/queries.ts` (documentosDaProposta),
// pois os anexos viraram Documento (ancorado no cliente). Aqui fica só a comparação de versões.

type SnapItem = { disciplina?: string; valor?: number | string };

/**
 * Versões da proposta para comparação (C3), com o TOTAL e os metadados vindo das colunas
 * estruturadas (F5.4) — não mais do JSON.
 *
 * ── O que mudou na F5.4, e o que deliberadamente não mudou ──────────────────────────────────
 * `total`, `validade`, `desconto` e `status` agora saem de `PropostaVersao.*`: é o aceite da
 * tarefa ("comparar duas versões sem parsear JSON") e o que permite a Fase 6 somar/agrupar
 * valor de proposta em SQL, coisa impossível com o número dentro de um `Json`.
 *
 * A lista de ITENS continua vindo do `snapshot`, e isso é de propósito: não existe tabela de
 * itens POR VERSÃO — `PropostaItem` guarda só o estado ATUAL da proposta. Criar uma seria
 * reescrever o versionamento, não evoluí-lo (ADR-05). O snapshot permanece sendo o detalhe.
 *
 * ── Versões anteriores à F5.4 ───────────────────────────────────────────────────────────────
 * O backfill da migration preencheu `valorOriginal`/`valorVersao` a partir do próprio snapshot,
 * então o histórico também responde pela coluna. O `?? soma dos itens` abaixo cobre o resto: a
 * linha cujo snapshot era malformado (a guarda `jsonb_typeof` deixou NULL) continua exibindo um
 * total em vez de "R$ 0,00" — degradação visível, não silenciosa.
 */
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
    return {
      numero: v.numero,
      autor: v.autor.name,
      data: v.createdAt.toISOString(),
      titulo: s.titulo ?? "",
      itens: norm,
      // Coluna primeiro; a soma do snapshot só como rede para a linha que o backfill não
      // conseguiu derivar.
      total: v.valorVersao != null ? Number(v.valorVersao) : norm.reduce((a, it) => a + it.valor, 0),
      valorOriginal: v.valorOriginal != null ? Number(v.valorOriginal) : null,
      desconto: v.desconto != null ? Number(v.desconto) : null,
      status: v.status,
      validade: v.validade ? v.validade.toISOString().slice(0, 10) : null,
    };
  });
}
