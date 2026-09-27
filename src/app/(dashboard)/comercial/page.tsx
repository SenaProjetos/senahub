import { NavComercial } from "@/components/comercial/nav-comercial";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { resumoComercial, homeComercial } from "@/modules/comercial/queries";
import { MetaCard } from "@/components/comercial/meta-card";
import { AlternanciaVisaoComercial } from "@/components/comercial/alternancia-visao-comercial";
import { HomeComercialView } from "@/components/comercial/home-comercial-view";

export const metadata: Metadata = { title: "Comercial" };

/**
 * Home do Comercial (F6.5, P16) — deixou de ser o Kanban de prospecção (que já tem rota própria,
 * `/comercial/prospeccao`) e virou central operacional: cards do mês + Meu Dia.
 */
export default async function ComercialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("comercial", "ver");
  const podeGerir = await can(user, "comercial", "gerir");
  const sp = await searchParams;
  const meus = (Array.isArray(sp.visao) ? sp.visao[0] : sp.visao) === "meus";
  const responsavelId = meus ? user.id : undefined;
  const [resumo, dados] = await Promise.all([
    resumoComercial(responsavelId),
    homeComercial(new Date(), responsavelId),
  ]);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Comercial"
        descricao={<>{resumo.leadsAtivos} lead(s) ativo(s) · {resumo.enviadas} proposta(s) enviada(s)</>}
      />
      <NavComercial />

      <AlternanciaVisaoComercial meus={meus} />

      <MetaCard
        ano={resumo.ano}
        mes={resumo.mes}
        meta={resumo.meta}
        realizado={resumo.realizado}
        podeGerir={podeGerir}
      />

      <HomeComercialView dados={dados} />
    </div>
  );
}
