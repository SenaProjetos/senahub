import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS, CLT_ROLES } from "@/lib/roles";
import { getPreferencias } from "@/modules/usuarios/preferencias/queries";
import { PreferenciasView } from "@/components/configuracoes/preferencias-view";

export const metadata: Metadata = { title: "Preferências" };

export default async function PreferenciasPage() {
  const user = await requireUser();
  const [prefs, perfilDb] = await Promise.all([
    getPreferencias(user.id),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true, image: true, telefone: true, cargo: true, departamento: true, dataAdmissao: true, role: true },
    }),
  ]);

  const perfil = {
    name: perfilDb?.name ?? user.name,
    email: perfilDb?.email ?? user.email,
    image: perfilDb?.image ?? null,
    telefone: perfilDb?.telefone ?? "",
    cargo: perfilDb?.cargo ?? null,
    departamento: perfilDb?.departamento ?? null,
    dataAdmissao: perfilDb?.dataAdmissao ? perfilDb.dataAdmissao.toISOString().slice(0, 10) : null,
    papel: ROLE_LABELS[perfilDb?.role ?? user.role],
  };

  const modoValido = prefs.ponto_email_modo === "resumo_diario" || prefs.ponto_email_modo === "nenhum";

  return (
    <PreferenciasView
      perfil={perfil}
      somChat={prefs.somChat !== false}
      mostrarRecibos={prefs.mostrarRecibos !== false}
      notifPrazoDisciplina={prefs.notif_prazo_disciplina !== false}
      notifInadimplencia={prefs.notif_inadimplencia !== false}
      notifCertidao={prefs.notif_certidao !== false}
      notifLicitacao={prefs.notif_licitacao !== false}
      notifDigestSemanal={prefs.notif_digest_semanal !== false}
      notifRiscoProjeto={prefs.notif_risco_projeto !== false}
      notifLembretePonto={prefs.notif_lembrete_ponto !== false}
      notifCoordenacao={prefs.notif_coordenacao !== false}
      notifAprovacaoArquivo={prefs.notif_aprovacao_arquivo !== false}
      pontoEmailModo={modoValido ? (prefs.ponto_email_modo as "resumo_diario" | "nenhum") : "todos"}
      mostrarAlertasPonto={CLT_ROLES.includes(perfilDb?.role ?? user.role)}
    />
  );
}
