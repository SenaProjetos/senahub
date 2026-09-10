import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireInterno } from "@/lib/session";
import { acharGuiaPublicado } from "@/lib/guias";
import { GuiaComercialView } from "@/components/comercial/guia-comercial-view";
import { GuiaProjetosView } from "@/components/projetos/guia-projetos-view";
import { GuiaFinanceiroView } from "@/components/financeiro/guia-financeiro-view";
import { GuiaRhPontoView } from "@/components/rh/guia-rh-ponto-view";
import { GuiaGestaoView } from "@/components/gestao/guia-gestao-view";

/**
 * Uma página por setor com guia publicado. O conteúdo é uma view por setor — não há leitura de
 * banco, então tudo aqui é estático.
 *
 * Setor inexistente ou ainda sem guia (`estado: "em-breve"`) cai em `notFound()`: o índice já diz
 * quais existem, e uma página vazia seria pior que um 404.
 */
const VIEWS: Record<string, () => ReactNode> = {
  "clientes-comercial": GuiaComercialView,
  projetos: GuiaProjetosView,
  financeiro: GuiaFinanceiroView,
  "rh-ponto": GuiaRhPontoView,
  gestao: GuiaGestaoView,
};

// Sem `generateStaticParams`: `requireInterno()` lê `headers()`, então a rota é dinâmica de todo
// jeito e nada seria pré-renderizado (conferido — `prerender-manifest.json` sai vazio). Declarar os
// params só marcaria a rota como ● no relatório do build, sugerindo uma página estática e pública
// que ela não é.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ setor: string }>;
}): Promise<Metadata> {
  const { setor } = await params;
  const ficha = acharGuiaPublicado(setor);
  if (!ficha) return { title: "Guia de uso" };
  return { title: `Guia — ${ficha.titulo}`, description: ficha.descricao };
}

export default async function GuiaSetorPage({ params }: { params: Promise<{ setor: string }> }) {
  await requireInterno();

  const { setor } = await params;
  const ficha = acharGuiaPublicado(setor);
  const View = ficha ? VIEWS[ficha.chave] : undefined;
  if (!View) notFound();

  return <View />;
}
