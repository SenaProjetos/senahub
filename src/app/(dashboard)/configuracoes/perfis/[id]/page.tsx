import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { perfilComMatriz } from "@/modules/perfis/queries";
import { PerfilMatrizView } from "@/components/configuracoes/perfil-matriz-view";

export const metadata: Metadata = { title: "Perfil de acesso" };

export default async function PerfilDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const perfil = await perfilComMatriz(id);
  if (!perfil) notFound();
  return (
    <PerfilMatrizView
      perfilId={perfil.id}
      nome={perfil.nome}
      chave={perfil.chave}
      sistema={perfil.sistema}
      matriz={perfil.matriz}
    />
  );
}
