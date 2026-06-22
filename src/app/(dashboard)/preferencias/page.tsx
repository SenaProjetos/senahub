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
      notifPrazoDisciplina={prefs.notif_prazo_disciplina !== false}
      notifInadimplencia={prefs.notif_inadimplencia !== false}
      notifCertidao={prefs.notif_certidao !== false}
      notifLicitacao={prefs.notif_licitacao !== false}
      notifDigestSemanal={prefs.notif_digest_semanal !== false}
    />
  );
}
