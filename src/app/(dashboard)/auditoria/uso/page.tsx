import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { analiseUso } from "@/modules/auditoria/queries";
import { PeriodoSelect } from "@/components/auditoria/periodo-select";
import { UsoCards } from "@/components/auditoria/uso-cards";
import { UsoMetricasTabela } from "@/components/auditoria/uso-metricas-tabela";
import { HeatmapUsoView } from "@/components/auditoria/heatmap-uso";
import { HeatmapDiaHora } from "@/components/auditoria/heatmap-dia-hora";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Uso por seção" };

const PERIODOS = [7, 14, 30, 90];

export default async function UsoPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  // `auditoria:ver` em vez de `requireRole("admin")` (F2 de
  // docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md): o par já existia no
  // catálogo e governava só o item de menu. Sem mudança de acesso — ninguém tem `auditoria:ver`
  // na semente, e o admin continua passando pelo bypass de `superUsuario`.
  await requirePermission("auditoria", "ver");
  const sp = await searchParams;
  const dias = PERIODOS.includes(Number(sp.dias)) ? Number(sp.dias) : 14;
  const data = await analiseUso(dias);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Uso por seção"
        descricao={<>Acessos (page-views) e ações por seção nos últimos {dias} dias — {data.totalAcessos} acessos · {data.totalAcoes} ações. {data.porDispositivo.celular + data.porDispositivo.computador > 0 && ` Celular: ${Math.round((data.porDispositivo.celular / (data.porDispositivo.celular + data.porDispositivo.computador)) * 100)}% dos acessos com dispositivo registrado (${data.porDispositivo.celular} celular · ${data.porDispositivo.computador} computador).`}</>}
        acoes={
          <>
          <PeriodoSelect dias={dias} />
          </>
        }
      />

      <UsoCards metricas={data.metricas} dias={dias} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Métricas por seção</CardTitle>
          <CardDescription>Clique numa seção para o detalhe. Δ compara com o período anterior equivalente.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <UsoMetricasTabela metricas={data.metricas} nomes={data.nomes} dias={dias} />
        </CardContent>
      </Card>

      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold">Intensidade por dia (acessos por seção)</h3>
        <HeatmapUsoView data={data.heatmapSecaoDia} />
      </section>

      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold">Quando o sistema é usado (dia da semana × hora)</h3>
        <HeatmapDiaHora data={data.diaHora} />
      </section>
    </div>
  );
}
