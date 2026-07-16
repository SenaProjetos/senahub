import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { carregarPreferenciasDaConta } from "@/modules/usuarios/preferencias/queries";
import { PreferenciasView } from "@/components/configuracoes/preferencias-view";

export const metadata: Metadata = { title: "Preferências" };

export default async function PreferenciasPage() {
  const user = await requireUser();
  const dados = await carregarPreferenciasDaConta(user.id);
  return <PreferenciasView {...dados} />;
}
