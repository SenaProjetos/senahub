import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ferramentaVisivel, getFerramenta, situacaoValidacao } from "@/modules/ferramentas/registry";
import { recentesDoUsuario } from "@/modules/ferramentas/queries";
import { listarProjetos } from "@/modules/projetos/queries";
import { FERRAMENTA_POR_TIPO } from "@/modules/estudos/acesso";
import { FerramentaView } from "@/components/ferramentas/ferramenta-view";
import { EscolhaProjetoEstudo } from "@/components/ferramentas/escolha-projeto-estudo";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ q?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  const meta = getFerramenta(key);
  // Em validação o nome não vai para o título da aba (a página responde 404 a quem não gere).
  return { title: meta && situacaoValidacao(meta) !== "em_validacao" ? meta.nome : "Ferramenta" };
}

export default async function FerramentaPage({ params, searchParams }: Props) {
  const { key } = await params;
  const { q } = await searchParams;
  const user = await requirePermission("ferramentas", "usar");
  const meta = getFerramenta(key);
  if (!meta) notFound();
  // Em validação: some para quem não gere as ferramentas (mesma regra da galeria).
  if (!ferramentaVisivel(meta, await can(user, "ferramentas", "gerir"))) notFound();

  // Motor só-estudo: não há calculadora avulsa. A pessoa escolhe o projeto e cai na aba Estudos (estudo novo do tipo).
  if (meta.soEstudo) {
    const tipoDoEstudo = Object.entries(FERRAMENTA_POR_TIPO).find(([, k]) => k === key)?.[0];
    if (!tipoDoEstudo) notFound();
    const busca = (q ?? "").trim().slice(0, 80);
    const { items } = await listarProjetos(user, { q: busca || undefined, take: 50 });
    return (
      <EscolhaProjetoEstudo
        nome={meta.nome}
        descricao={meta.descricao}
        tipoDoEstudo={tipoDoEstudo}
        q={busca}
        projetos={items.map((p) => ({ id: p.id, codigo: p.codigo, nome: p.nome, cliente: p.cliente?.nome ?? null }))}
      />
    );
  }

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
