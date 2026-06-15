import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { getPreferencias } from "@/modules/usuarios/preferencias/queries";
import { PreferenciasView } from "@/components/configuracoes/preferencias-view";

export const metadata: Metadata = { title: "Preferências" };

export default async function PreferenciasPage() {
  const user = await requireUser();
  const prefs = await getPreferencias(user.id);
  return (
    <PreferenciasView
      somChat={prefs.somChat !== false}
      mostrarRecibos={prefs.mostrarRecibos !== false}
    />
  );
}
