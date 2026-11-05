import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Layers } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import {
  cenaDaSobreposicao,
  documentosParaCamada,
  sobreposicoesDoProjeto,
} from "@/modules/coordenacao/sobreposicao/queries";
import { EmptyState } from "@/components/ui/empty-state";
import { NavCoordenacao } from "@/components/coordenacao/nav-coordenacao";
import { SobreposicaoCabecalho } from "@/components/coordenacao/sobreposicao/sobreposicao-cabecalho";
import { SobreposicaoViewCarregador } from "@/components/coordenacao/sobreposicao/sobreposicao-view-carregador";

export const metadata: Metadata = { title: "Sobreposição 2D" };

export default async function SobreposicaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  // As queries da sobreposição não checam permissão nem escopo: o portão é este.
  const user = await requirePermission("coordenacao", "ver");
  const { id } = await params;
  const sp = await searchParams;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  const [sobreposicoes, podeGerir] = await Promise.all([
    sobreposicoesDoProjeto(id),
    can(user, "coordenacao", "gerir").then((ok) => ok && user.tipo === "interno"),
  ]);

  // Sem `?s=` abre a primeira; um `?s=` que não é deste projeto é 404, nunca a sobreposição de outro.
  const selecionadaId = sp.s ?? sobreposicoes[0]?.id ?? null;
  if (sp.s && !sobreposicoes.some((s) => s.id === sp.s)) notFound();

  const cabecalho = (
    <SobreposicaoCabecalho projetoId={id} sobreposicoes={sobreposicoes} selecionadaId={selecionadaId} podeGerir={podeGerir} />
  );

  if (!selecionadaId) {
    return (
      <div className="space-y-4">
        <NavCoordenacao projetoId={id} />
        {cabecalho}
        <EmptyState
          icon={Layers}
          title="Nenhuma sobreposição neste projeto"
          description={
            podeGerir
              ? "Crie uma sobreposição para cada pavimento e some as plantas das disciplinas."
              : "Peça à coordenação para criar a sobreposição de um pavimento."
          }
        />
      </div>
    );
  }

  const [cena, documentos] = await Promise.all([cenaDaSobreposicao(selecionadaId, user), documentosParaCamada(id)]);
  if (!cena || cena.projetoId !== id) notFound();

  return (
    <div className="space-y-4">
      <NavCoordenacao projetoId={id} />
      {cabecalho}
      <SobreposicaoViewCarregador cena={cena} documentos={documentos} sobreposicoes={sobreposicoes} />
    </div>
  );
}
