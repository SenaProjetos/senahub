import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { GLOBAL_ROLES } from "@/lib/roles";
import { pendentesAprovacao } from "@/modules/arquivos/queries";
import { pedidosExclusaoPendentes } from "@/modules/uploads/queries";
import { AprovacoesView } from "@/components/arquivos/aprovacoes-view";
import { PedidosExclusaoView } from "@/components/arquivos/pedidos-exclusao-view";

export const metadata: Metadata = { title: "Aprovações" };

export default async function AprovacoesPage() {
  // Painel de validação = escrita: só admin/supervisor (sem piso de sócio, que é leitura).
  const user = await requireUser();
  if (!GLOBAL_ROLES.includes(user.role)) redirect("/sem-permissao");

  // Decidir exclusão é só-admin (mesmo gate da lixeira) — supervisor não vê a fila.
  const ehAdmin = user.role === "admin";
  const [pendentes, pedidosExclusao] = await Promise.all([
    pendentesAprovacao(),
    ehAdmin ? pedidosExclusaoPendentes() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Aprovações</h1>
        <p className="text-sm text-muted-foreground">
          Entregáveis (pacotes A/B) aguardando validação, com atalho direto para a pasta do projeto.
        </p>
      </div>
      <AprovacoesView pendentes={pendentes} />

      {ehAdmin && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Pedidos de exclusão</h2>
            <p className="text-sm text-muted-foreground">
              Arquivos que alguém sem permissão pediu para excluir. Nada foi removido — aprovar manda o
              arquivo para a lixeira do projeto; manter conserva o arquivo e devolve o motivo a quem pediu.
            </p>
          </div>
          <PedidosExclusaoView pedidos={pedidosExclusao} />
        </div>
      )}
    </div>
  );
}
