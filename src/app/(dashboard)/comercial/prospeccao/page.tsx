import { redirect } from "next/navigation";

/**
 * Rota antiga do Kanban de Prospecção — hoje o board único `/comercial/funil` (ADR-0004). Fica
 * como redirecionamento porque há links dela em sinos já entregues e no manual; a query string
 * (filtros, `lead=`) segue junto.
 */
export default async function ProspeccaoPage({
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
