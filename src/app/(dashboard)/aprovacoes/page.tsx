import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { GLOBAL_ROLES } from "@/lib/roles";
import { pendentesAprovacao } from "@/modules/arquivos/queries";
import { AprovacoesView } from "@/components/arquivos/aprovacoes-view";

export const metadata: Metadata = { title: "Aprovações" };

export default async function AprovacoesPage() {
  // Painel de validação = escrita: só admin/supervisor (sem piso de sócio, que é leitura).
  const user = await requireUser();
  if (!GLOBAL_ROLES.includes(user.role)) redirect("/sem-permissao");

  const pendentes = await pendentesAprovacao();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Aprovações</h1>
        <p className="text-sm text-muted-foreground">
          Entregáveis (pacotes A/B) aguardando validação, com atalho direto para a pasta do projeto.
        </p>
      </div>
      <AprovacoesView pendentes={pendentes} />
    </div>
  );
}
