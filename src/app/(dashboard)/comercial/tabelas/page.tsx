import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarTabelasPreco } from "@/modules/comercial/queries";
import { catalogoDisciplinas } from "@/modules/projetos/queries";
import { TabelasView } from "@/components/comercial/tabelas-view";

export const metadata: Metadata = { title: "Tabelas de preço" };

export default async function TabelasPage() {
  await requirePermission("comercial", "gerir");
  const [tabelas, catalogo] = await Promise.all([listarTabelasPreco(), catalogoDisciplinas()]);
  return (
    <TabelasView
      catalogo={catalogo.map((d) => d.nome)}
      tabelas={tabelas.map((t) => ({
        id: t.id,
        nome: t.nome,
        itens: t.itens.map((it) => ({ disciplina: it.disciplina, valorM2: Number(it.valorM2) })),
      }))}
    />
  );
}
