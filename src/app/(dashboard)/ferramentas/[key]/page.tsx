import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ferramentaVisivel, getFerramenta, situacaoValidacao } from "@/modules/ferramentas/registry";
import { recentesDoUsuario } from "@/modules/ferramentas/queries";
import { FerramentaView } from "@/components/ferramentas/ferramenta-view";

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  const meta = getFerramenta(key);
  // Em validação o nome não vai para o título da aba (a página responde 404 a quem não gere).
  return { title: meta && situacaoValidacao(meta) !== "em_validacao" ? meta.nome : "Ferramenta" };
}

export default async function FerramentaPage({ params }: Props) {
  const { key } = await params;
  const user = await requirePermission("ferramentas", "usar");
  const meta = getFerramenta(key);
  if (!meta || meta.soEstudo) notFound();
  // Em validação: some para quem não gere as ferramentas (mesma regra da galeria).
  if (!ferramentaVisivel(meta, await can(user, "ferramentas", "gerir"))) notFound();

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
