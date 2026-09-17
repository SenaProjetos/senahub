import { redirect } from "next/navigation";

/**
 * A aba Lista Mestre saiu (2026-09-17): o cadastro manual de folhas virou a geração do
 * documento -LMS, que mora na aba Arquivos ("Gerar Lista Mestre"), e o padrão de nomenclatura
 * com as siglas do projeto viraram o botão "Nomenclatura" da mesma aba. A rota fica de pé só
 * para link e favorito antigos não caírem em 404.
 */
export default async function ListaMestreRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projetos/${id}/arquivos`);
}
