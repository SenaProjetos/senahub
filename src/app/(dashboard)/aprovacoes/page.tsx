import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { pendentesAprovacao } from "@/modules/arquivos/queries";
import { disciplinasProntasParaAprovar } from "@/modules/projetos/queries";
import { podeVerTodasDisciplinas } from "@/modules/arquivos/acesso";
import { pedidosExclusaoPendentes } from "@/modules/uploads/queries";
import { AprovacoesView } from "@/components/arquivos/aprovacoes-view";
import { ProntasAprovacaoView } from "@/components/arquivos/prontas-aprovacao-view";
import { PedidosExclusaoView } from "@/components/arquivos/pedidos-exclusao-view";

export const metadata: Metadata = { title: "Aprovações" };

export default async function AprovacoesPage() {
  // Painel de validação = escrita. `can()` puro e NÃO `requirePermission`: este último aplica o
  // piso de sócio, que é read-only por decisão de 2026-08-08 (§15.7) e não pode abrir escrita.
  // Era `GLOBAL_ROLES.includes(user.role)` — o menu já exigia `uploads:validar`, então conceder
  // o par mostrava o item e mandava para /sem-permissao no clique (F2 de
  // docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md). Sem mudança de acesso:
  // `uploads:validar` está semeado no coordenador, e o admin passa por `superUsuario`.
  const user = await requireUser();
  const [podeValidar, podeExcluir] = await Promise.all([
    can(user, "uploads", "validar"),
    // Decidir exclusão segue o mesmo eixo da lixeira do projeto: `arquivos:excluir` (ninguém o
    // tem na semente, então continua sendo só o admin, via bypass). O coordenador não vê a fila.
    can(user, "arquivos", "excluir"),
  ]);
  if (!podeValidar) redirect("/sem-permissao");

  // Perfis globais já retornam true aqui — derivar em vez de fixar `true` mantém a muralha
  // por disciplina caso o gate da tela um dia se abra para outro perfil.
  const veTodasDisc = await podeVerTodasDisciplinas(user);
  const [pendentes, prontas, pedidosExclusao] = await Promise.all([
    pendentesAprovacao(),
    disciplinasProntasParaAprovar(user, veTodasDisc),
    podeExcluir ? pedidosExclusaoPendentes() : Promise.resolve([]),
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

      {podeExcluir && (
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
