import { NavComercial } from "@/components/comercial/nav-comercial";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  inteligenciaComercial,
  opcoesFiltroInteligencia,
  listasReativacao,
  filtrosSalvosInteligencia,
} from "@/modules/comercial/inteligencia/queries";
import { lerFiltrosInteligencia } from "@/modules/comercial/inteligencia/filtros";
import { FiltrosComerciais } from "@/components/comercial/filtros-comerciais";
import { InteligenciaComercialView } from "@/components/comercial/inteligencia-comercial-view";
import { FiltrosSalvosInteligencia } from "@/components/comercial/filtros-salvos-inteligencia";
import { ListasReativacaoView } from "@/components/comercial/listas-reativacao-view";
import { ExportarInteligenciaCsvButton } from "@/components/comercial/exportar-inteligencia-csv-button";

export const metadata: Metadata = { title: "Inteligência Comercial" };

export default async function InteligenciaComercialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("comercial", "ver");
  const podeGerir = await can(user, "comercial", "gerir");
  const sp = await searchParams;
  const filtros = lerFiltrosInteligencia(sp);
  const agora = new Date();
  const [dados, opcoes, listas, filtrosSalvos] = await Promise.all([
    inteligenciaComercial(filtros, agora),
    opcoesFiltroInteligencia(),
    listasReativacao(agora),
    filtrosSalvosInteligencia(user.id),
  ]);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Inteligência Comercial"
        descricao="Conversão, receita, canais e recorrência calculados a partir dos registros reais."
        acoes={podeGerir ? <ExportarInteligenciaCsvButton /> : undefined}
      />
      <NavComercial />

      <FiltrosComerciais
        opcoes={opcoes.base}
        mostrarDisciplina
        inteligencia={opcoes.inteligencia}
      />
      <FiltrosSalvosInteligencia filtros={filtrosSalvos} />

      <InteligenciaComercialView dados={dados} />
      <ListasReativacaoView dados={listas} foco={filtros.focoReativacao} />
    </div>
  );
}
