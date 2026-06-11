import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { carregarMatriz } from "@/modules/permissoes/queries";
import { MatrizPermissoes } from "@/components/configuracoes/matriz-permissoes";

export const metadata: Metadata = { title: "Permissões" };

export default async function PermissoesPage() {
  await requireRole("admin", "supervisor", "administrativo");
  const matriz = await carregarMatriz();
  return <MatrizPermissoes matriz={matriz} />;
}
