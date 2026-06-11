import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listarClientes } from "@/modules/clientes/queries";
import { ClientesView } from "@/components/clientes/clientes-view";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePermission("clientes", "ver");
  const sp = await searchParams;
  const clientes = await listarClientes({ q: sp.q, incluirInativos: true });
  const podeGerir = await can(user.role, "clientes", "gerir");

  return <ClientesView clientes={clientes} podeGerir={podeGerir} busca={sp.q ?? ""} />;
}
