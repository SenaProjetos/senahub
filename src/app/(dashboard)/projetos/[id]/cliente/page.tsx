import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireInterno } from "@/lib/session";
import { conversaParaEquipe } from "@/modules/portal/mensagens/queries";
import { aprovacoesParaEquipe } from "@/modules/portal/aprovacao-entrega/queries";
import { ConversaEquipe } from "@/components/mensagens-cliente/conversa-equipe";
import { AprovacoesEquipe } from "@/components/mensagens-cliente/aprovacoes-equipe";
import { atasParaEquipe } from "@/modules/portal/atas/queries";
import { ReunioesEquipe } from "@/components/atas/reunioes-equipe";
import { agendaParaEquipe } from "@/modules/portal/agenda/queries";
import { AgendaEquipe } from "@/components/agenda-equipe/agenda-equipe";

export const metadata: Metadata = { title: "Cliente — projeto" };

/**
 * Aba Cliente: a conversa do cliente do portal com a coordenação, as aprovações de entrega, as atas de reunião e a agenda (reuniões agendadas e marcos do contrato). Só a audiência da conversa
 * (`podeVerConversa`, dentro das duas leituras) chega aqui; os demais — projetista, cliente do portal — recebem 404.
 */
export default async function ClienteProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireInterno();
  const { id } = await params;
  const conversa = await conversaParaEquipe(id, user.id);
  if (!conversa) notFound();
  const aprovacoes = await aprovacoesParaEquipe(id, user.id);
  const atas = await atasParaEquipe(id, user.id);
  // A agenda é um bloco à parte: se a leitura falhar, a conversa e as atas continuam na tela.
  const agenda = await agendaParaEquipe(id, user.id).catch((e: unknown) => {
    console.error("[agenda] leitura da equipe falhou:", e);
    return null;
  });
  return (
    <div className="space-y-6">
      <ConversaEquipe projetoId={id} inicial={conversa} />
      {aprovacoes && <AprovacoesEquipe projetoId={id} aprovacoes={aprovacoes} />}
      {atas && <ReunioesEquipe projetoId={id} reunioes={atas.reunioes} pendencias={atas.pendencias} contasAtivas={atas.contasAtivas} />}
      {agenda && <AgendaEquipe projetoId={id} dados={agenda} />}
    </div>
  );
}
