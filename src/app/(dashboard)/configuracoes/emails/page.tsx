import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { smtpConfigurado } from "@/lib/mail";
import { listarTemplates } from "@/modules/configuracoes/emails/queries";
import { EmailsView } from "@/components/configuracoes/emails-view";

export const metadata: Metadata = { title: "Modelos de e-mail" };

export default async function EmailsPage() {
  await requirePermission("configuracoes", "gerir");
  const categorias = await listarTemplates();
  return <EmailsView categorias={categorias} smtpAtivo={smtpConfigurado()} />;
}
