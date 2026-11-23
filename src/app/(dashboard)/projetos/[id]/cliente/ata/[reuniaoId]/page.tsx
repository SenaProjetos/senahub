import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireInterno } from "@/lib/session";
import { ataParaEditar } from "@/modules/portal/atas/queries";
import { EditorAta } from "@/components/atas/editor-ata";
import { TextoAta } from "@/components/atas/texto-ata";

export const metadata: Metadata = { title: "Ata de reunião — projeto" };

/**
 * Editor do rascunho da ata, dentro da aba Cliente do projeto (o cabeçalho do projeto vem do layout, como nas outras
 * abas). Só a audiência da conversa com a coordenação; outra pessoa ou reunião de outro projeto = 404. Sem rascunho
 * (ata publicada sem correção em andamento, ou retirada), mostra a versão vigente só para leitura.
 */
export default async function EditorAtaPage({ params }: { params: Promise<{ id: string; reuniaoId: string }> }) {
  const user = await requireInterno();
  const { id, reuniaoId } = await params;
  const dados = await ataParaEditar(reuniaoId, user.id);
  if (!dados || dados.projeto.id !== id) notFound();
  if (dados.reuniao.rascunho && !dados.reuniao.retirada) return <EditorAta dados={dados} />;
  return (
    <div className="space-y-3">
      <a href={`/projetos/${id}/cliente#atas`} className="text-sm underline underline-offset-2">
        Voltar para a aba Cliente
      </a>
      <p className="text-sm text-muted-foreground">
        {dados.reuniao.retirada ? "Esta ata foi retirada." : "Esta ata não tem rascunho. Para mudar algo, use Corrigir ata na aba Cliente."}
      </p>
      {dados.reuniao.vigente && <TextoAta texto={dados.reuniao.vigente.texto} />}
    </div>
  );
}
