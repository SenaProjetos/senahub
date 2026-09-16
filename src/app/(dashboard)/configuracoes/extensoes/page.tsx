import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarExtensoesAdmin, extensoesDesconhecidasNoAcervo } from "@/modules/uploads/nomenclatura/queries";
import { ExtensoesCatalogoView } from "@/components/configuracoes/extensoes-catalogo-view";

export const metadata: Metadata = { title: "Extensões de arquivo" };

export default async function ExtensoesConfigPage() {
  await requirePermission("configuracoes", "gerir");
  const [itens, desconhecidas] = await Promise.all([listarExtensoesAdmin(), extensoesDesconhecidasNoAcervo()]);

  return <ExtensoesCatalogoView itens={itens} desconhecidas={desconhecidas} />;
}
