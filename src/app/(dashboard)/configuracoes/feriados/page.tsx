import type { Metadata } from "next";
import { requireGestorRh } from "@/lib/session";

import { listarFeriados, listarFeriadosRecorrentes } from "@/modules/rh/feriados/queries";
import { FeriadosView } from "@/components/configuracoes/feriados-view";

export const metadata: Metadata = { title: "Feriados" };

export default async function FeriadosPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  await requireGestorRh();
  const sp = await searchParams;
  const ano = Number(sp.ano) || new Date().getFullYear();
  const [feriados, recorrentes] = await Promise.all([listarFeriados(ano), listarFeriadosRecorrentes()]);
  return <FeriadosView ano={ano} feriados={feriados} recorrentes={recorrentes} />;
}
