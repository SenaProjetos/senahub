import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { pendenciasDoCiclo } from "@/modules/uploads/ciclo/pendencias-queries";
import { PendenciasView } from "@/components/arquivos/pendencias-view";

export const metadata: Metadata = { title: "Pendências documentais" };

export default async function PendenciasDocumentaisPage() {
  // Dispensar é escrita: `can()` puro, e NÃO `requirePermission` (que aplica o piso de sócio, só leitura).
  // O gate é o mesmo da audiência do aviso diário e das ações.
  const user = await requireUser();
  if (user.tipo !== "interno" || !(await can(user, "notificacoes", "gestao"))) redirect("/sem-permissao");

  const dados = await pendenciasDoCiclo();
  return <PendenciasView {...dados} />;
}
