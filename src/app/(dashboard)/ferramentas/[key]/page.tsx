import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { getFerramenta } from "@/modules/ferramentas/registry";
import { recentesDoUsuario } from "@/modules/ferramentas/queries";
import { FerramentaView } from "@/components/ferramentas/ferramenta-view";

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  const meta = getFerramenta(key);
  return { title: meta?.nome ?? "Ferramenta" };
}

export default async function FerramentaPage({ params }: Props) {
  const { key } = await params;
  const user = await requirePermission("ferramentas", "usar");
  const meta = getFerramenta(key);
  if (!meta) notFound();

  const recentes = await recentesDoUsuario(key, user.id);

  // Passa só a chave (string) + dados serializáveis; o FerramentaView resolve o `meta`
  // (que contém o ícone-componente) a partir do registry no cliente.
  return (
    <FerramentaView
      ferramentaKey={meta.key}
      recentes={recentes.map((r) => ({
        id: r.id,
        titulo: r.titulo,
        ferramenta: r.ferramenta,
        projetoId: r.projetoId,
        disciplinaId: r.disciplinaId,
        createdAt: r.createdAt.toISOString(),
      }))}
    />
  );
}
