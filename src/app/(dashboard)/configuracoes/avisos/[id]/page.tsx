import { redirect } from "next/navigation";

/** O detalhe do aviso saiu de Configurações e mora em /avisos/<id> — mantém links antigos. */
export default async function AvisoDetalheConfiguracoesRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/avisos/${id}`);
}
