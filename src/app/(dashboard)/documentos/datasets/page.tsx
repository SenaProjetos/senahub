import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { Metadata } from "next";
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
      <CabecalhoPagina titulo="Datasets" descricao="Planilhas de CSV reutilizáveis como fonte de dados para os documentos." />

      <DatasetsView datasets={itens} />
    </div>
  );
}
