import type { Metadata } from "next";
import { requireGestorRh } from "@/lib/session";
import { listarEstagiariosAtivos, listarTabelasEncargos } from "@/modules/rh/tabela-encargos/queries";
import { EncargosEmpresaView } from "@/components/rh/encargos-empresa/encargos-view";

export const metadata: Metadata = { title: "Encargos da empresa" };

export default async function EncargosEmpresaPage() {
  await requireGestorRh();
  const [versoes, estagiarios] = await Promise.all([listarTabelasEncargos(), listarEstagiariosAtivos()]);
  return <EncargosEmpresaView versoes={versoes} estagiarios={estagiarios} />;
}
