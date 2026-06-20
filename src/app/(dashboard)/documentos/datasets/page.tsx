import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { listarDatasets } from "@/modules/documentos/dataset-queries";
import { DatasetsView } from "@/components/documentos/datasets-view";

export const metadata: Metadata = { title: "Datasets de documentos" };

export default async function DatasetsPage() {
  await requirePermission("documentos", "gerir");
  const datasets = await listarDatasets();

  const itens = datasets.map((d) => ({
    id: d.id,
    nome: d.nome,
    nColunas: d.nColunas,
    nLinhas: d.nLinhas,
    createdAt: d.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/documentos"
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Estúdio de Documentos
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Datasets</h2>
        <p className="text-sm text-muted-foreground">
          Planilhas de CSV reutilizáveis como fonte de dados para os documentos.
        </p>
      </div>

      <DatasetsView datasets={itens} />
    </div>
  );
}
