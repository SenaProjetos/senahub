import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { obterMaquina } from "@/modules/patrimonio/queries";
import { MaquinaDetalheView } from "@/components/patrimonio/maquina-detalhe";

export const metadata: Metadata = { title: "Relatório da máquina — TI" };

export default async function MaquinaPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("patrimonio", "ti");
  const { id } = await params;
  const maquina = await obterMaquina(id);
  if (!maquina) notFound();
  return <MaquinaDetalheView maquina={maquina} podeTi />;
}
