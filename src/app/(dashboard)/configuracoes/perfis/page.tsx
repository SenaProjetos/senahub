import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { listarPerfis } from "@/modules/perfis/queries";
import { PerfisView } from "@/components/configuracoes/perfis-view";

export const metadata: Metadata = { title: "Perfis de acesso" };

export default async function PerfisPage() {
  // Criar/editar a matriz de um perfil é restrito a admin — ver modules/perfis/actions.ts.
  await requireRole("admin");
  const perfis = await listarPerfis();
  return <PerfisView perfis={perfis} />;
}
