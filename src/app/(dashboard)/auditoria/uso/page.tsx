import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/session";
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
  await requireRole("admin");
  const sp = await searchParams;
  const dias = PERIODOS.includes(Number(sp.dias)) ? Number(sp.dias) : 14;
  const data = await analiseUso(dias);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/auditoria"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Auditoria
          </Link>
          <h2 className="text-2xl font-extrabold tracking-tight">Uso por seção</h2>
          <p className="text-sm text-muted-foreground">
            Acessos (page-views) e ações por seção nos últimos {dias} dias — {data.totalAcessos} acessos · {data.totalAcoes} ações.
          </p>
        </div>
        <PeriodoSelect dias={dias} />
      </div>

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
        <HeatmapUsoView data={data.heatmapSecaoDia} dias={dias} />
      </section>

      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold">Quando o sistema é usado (dia da semana × hora)</h3>
        <HeatmapDiaHora data={data.diaHora} />
      </section>
    </div>
  );
}
