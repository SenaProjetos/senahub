import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { GLOBAL_ROLES } from "@/lib/roles";
import { pendentesAprovacao } from "@/modules/arquivos/queries";
import { disciplinasProntasParaAprovar } from "@/modules/projetos/queries";
import { podeVerTodasDisciplinas } from "@/modules/arquivos/acesso";
import { pedidosExclusaoPendentes } from "@/modules/uploads/queries";
import { AprovacoesView } from "@/components/arquivos/aprovacoes-view";
import { ProntasAprovacaoView } from "@/components/arquivos/prontas-aprovacao-view";
import { PedidosExclusaoView } from "@/components/arquivos/pedidos-exclusao-view";

export const metadata: Metadata = { title: "Aprovações" };

export default async function AprovacoesPage() {
  // Painel de validação = escrita: só admin/supervisor (sem piso de sócio, que é leitura).
  const user = await requireUser();
  if (!GLOBAL_ROLES.includes(user.role)) redirect("/sem-permissao");

  // Decidir exclusão é só-admin (mesmo gate da lixeira) — supervisor não vê a fila.
  const ehAdmin = user.role === "admin";
  // Perfis globais já retornam true aqui — derivar em vez de fixar `true` mantém a muralha
  // por disciplina caso o gate da tela um dia se abra para outro perfil.
  const veTodasDisc = await podeVerTodasDisciplinas(user);
  const [pendentes, prontas, pedidosExclusao] = await Promise.all([
    pendentesAprovacao(),
    disciplinasProntasParaAprovar(user, veTodasDisc),
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

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Prontas para aprovar</h2>
          <p className="text-sm text-muted-foreground">
            Disciplinas que já cumpriram tudo e só esperam a aprovação — o status
            &quot;Aprovado&quot; não sai do seletor, sai do botão no card da disciplina.
          </p>
        </div>
        <ProntasAprovacaoView prontas={prontas} />
      </div>

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
