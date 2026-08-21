import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { obterLead, funilCompleto, parceirosAtivos, proximasAcoesDe } from "@/modules/comercial/queries";
import type { LeadItem } from "@/modules/comercial/queries";
import { mesclarTimeline, ultimaInteracaoDe } from "@/modules/comercial/atividade";
import { LeadDetalheView } from "@/components/comercial/lead-detalhe-view";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("comercial", "ver");
  const { id } = await params;
  const [lead, etapas, parceiros] = await Promise.all([obterLead(id), funilCompleto(), parceirosAtivos()]);
  if (!lead) notFound();

  // Segunda consulta, não incluída em `obterLead`: próximas ações são compromissos, tabela
  // separada da Lead — a âncora é polimórfica e sem FK (F2.10), então não dá pra trazer via
  // `include`.
  const proximasAcoes = await proximasAcoesDe("LEAD", id);

  // Normaliza p/ o shape de LeadItem usado pelo modal/cards
  // (Decimal → number; _count.propostas a partir da relação).
  const leadItem: LeadItem = {
    ...lead,
    valorEstimado: lead.valorEstimado != null ? Number(lead.valorEstimado) : null,
    _count: { propostas: lead.propostas.length },
  };

  // F2.11: mescla o histórico legado (AtividadeLead) com a timeline nova (Atividade) — a página
  // é quem monta a visão, `mesclarTimeline`/`ultimaInteracaoDe` são puros e não sabem de Prisma.
  const atividadesTimeline = mesclarTimeline(lead.atividades, lead.atividadesComerciais);
  const ultimaInteracao = ultimaInteracaoDe(atividadesTimeline);

  return (
    <LeadDetalheView
      lead={leadItem}
      etapaAtual={{ id: lead.etapa.id, nome: lead.etapa.nome, cor: lead.etapa.cor }}
      etapas={etapas.map((e) => ({ id: e.id, nome: e.nome }))}
      propostas={lead.propostas}
      parceiros={parceiros}
      atividadesTimeline={atividadesTimeline}
      proximasAcoes={proximasAcoes.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        titulo: a.titulo,
        inicio: a.inicio.toISOString(),
        local: a.local,
        criador: a.criador.name,
      }))}
      ultimaInteracao={ultimaInteracao?.toISOString() ?? null}
    />
  );
}
