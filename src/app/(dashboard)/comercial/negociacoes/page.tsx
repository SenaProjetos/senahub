import { redirect } from "next/navigation";

/**
 * Rota antiga do Kanban de Negociações — hoje o board único `/comercial/funil` (ADR-0004). O job
 * de automações (F7.3) grava `/comercial/negociacoes?negociacao=<id>` em sinos já entregues; o
 * redirecionamento leva a query junto e o board rola até o card.
 */
export default async function NegociacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (v != null) p.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
  }
  const qs = p.toString();
  redirect(qs ? `/comercial/funil?${qs}` : "/comercial/funil");
}
