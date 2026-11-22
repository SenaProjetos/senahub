import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireInterno } from "@/lib/session";
import { conversaParaEquipe } from "@/modules/portal/mensagens/queries";
import { aprovacoesParaEquipe } from "@/modules/portal/aprovacao-entrega/queries";
import { ConversaEquipe } from "@/components/mensagens-cliente/conversa-equipe";
import { AprovacoesEquipe } from "@/components/mensagens-cliente/aprovacoes-equipe";

export const metadata: Metadata = { title: "Cliente — projeto" };

/**
 * Aba Cliente: a conversa do cliente do portal com a coordenação e as aprovações de entrega. Só a audiência da conversa
 * (`podeVerConversa`, dentro das duas leituras) chega aqui; os demais — projetista, cliente do portal — recebem 404.
 */
export default async function ClienteProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireInterno();
  const { id } = await params;
  const conversa = await conversaParaEquipe(id, user.id);
  if (!conversa) notFound();
  const aprovacoes = await aprovacoesParaEquipe(id, user.id);
  return (
    <div className="space-y-6">
      <ConversaEquipe projetoId={id} inicial={conversa} />
      {aprovacoes && <AprovacoesEquipe projetoId={id} aprovacoes={aprovacoes} />}
    </div>
  );
}
