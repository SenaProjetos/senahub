import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { listarFeriados } from "@/modules/rh/feriados/queries";
import { FeriadosView } from "@/components/configuracoes/feriados-view";

export const metadata: Metadata = { title: "Feriados" };

export default async function FeriadosPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  await requireRole(...HR_ADMIN_ROLES);
  const sp = await searchParams;
  const ano = Number(sp.ano) || new Date().getFullYear();
  const feriados = await listarFeriados(ano);
  return <FeriadosView ano={ano} feriados={feriados} />;
}
