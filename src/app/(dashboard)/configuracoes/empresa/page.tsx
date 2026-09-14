import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { dadosEmpresa } from "@/modules/configuracoes/empresa/queries";
import { EmpresaView } from "@/components/configuracoes/empresa-view";

export const metadata: Metadata = { title: "Dados da empresa" };

export default async function EmpresaPage() {
  await requirePermission("configuracoes", "gerir");
  const dados = await dadosEmpresa();
  return <EmpresaView dados={dados} />;
}
