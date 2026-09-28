import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { listarVersoesAdmin } from "@/modules/projetos/nomenclatura/versoes-queries";
import { carregarCatalogoSnap } from "@/modules/projetos/nomenclatura/catalogo/queries";
import { catalogoNaVersao } from "@/modules/projetos/nomenclatura/catalogo/versao";
import { CatalogoVersaoView } from "@/components/configuracoes/catalogo-versao-view";

export async function generateMetadata({ params }: { params: Promise<{ numero: string }> }): Promise<Metadata> {
  const { numero } = await params;
  return { title: `Catálogo da v${numero}` };
}

export default async function CatalogoVersaoPage({ params }: { params: Promise<{ numero: string }> }) {
  await requirePermission("configuracoes", "gerir");
  const { numero } = await params;
  const n = Number(numero);
  if (!Number.isInteger(n) || n < 1) notFound();
  const [versoes, snap] = await Promise.all([listarVersoesAdmin(), carregarCatalogoSnap()]);
  const versao = versoes.find((v) => v.numero === n);
  if (!versao) notFound();

  return (
    <CatalogoVersaoView
      versao={{ numero: versao.numero, nome: versao.nome, publicada: !!versao.publicadaEm, projetosFixados: versao.projetosFixados }}
      versoes={versoes.map((v) => ({ numero: v.numero, nome: v.nome, publicada: !!v.publicadaEm }))}
      catalogo={catalogoNaVersao(snap, n)}
    />
  );
}
