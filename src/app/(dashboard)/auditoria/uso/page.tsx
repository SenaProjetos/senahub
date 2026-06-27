import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/session";
import { heatmapUso } from "@/modules/auditoria/queries";
import { HeatmapUsoView } from "@/components/auditoria/heatmap-uso";

export const metadata: Metadata = { title: "Uso por seção" };

const DIAS = 14;

export default async function UsoPage() {
  await requireRole("admin");
  const data = await heatmapUso(DIAS);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/auditoria"
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Auditoria
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Uso por seção</h2>
        <p className="text-sm text-muted-foreground">
          Intensidade de atividade (ações registradas) por seção nos últimos {DIAS} dias — {data.totalGeral} eventos.
        </p>
      </div>
      <HeatmapUsoView data={data} dias={DIAS} />
    </div>
  );
}
