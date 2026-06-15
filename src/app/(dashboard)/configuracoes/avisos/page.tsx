import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { AvisoGeralView } from "@/components/configuracoes/aviso-geral-view";

export const metadata: Metadata = { title: "Aviso geral" };

export default async function AvisosPage() {
  await requirePermission("avisos", "enviar");
  return <AvisoGeralView />;
}
