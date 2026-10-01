import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigirAcessoNomenclatura } from "@/modules/projetos/nomenclatura/acesso";
import { listarVersoesAdmin } from "@/modules/projetos/nomenclatura/versoes-queries";
import { carregarCatalogoSnap } from "@/modules/projetos/nomenclatura/catalogo/queries";
import { catalogoNaVersao } from "@/modules/projetos/nomenclatura/catalogo/versao";
import { catalogoDisciplinasAdmin } from "@/modules/projetos/queries";
import { CatalogoVersaoView, type CadastroCard, type AbaCatalogo } from "@/components/configuracoes/catalogo-versao-view";

export const metadata: Metadata = { title: "Disciplinas e nomenclatura" };

const ABAS: readonly AbaCatalogo[] = ["disciplinas", "fases", "tipos"];

export default async function CatalogoVersaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ lente: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { podeGerir, podeEditarCard } = await exigirAcessoNomenclatura();
  const { lente } = await params;
  const { aba } = await searchParams;
  // Só a lente de uma versão (número). A lente "Todas as versões" entra na F3 da spec 2026-09-30.
  const n = /^\d+$/.test(lente) ? Number(lente) : NaN;
  if (!Number.isInteger(n) || n < 1) notFound();
  const [versoes, snap, cadastroCards] = await Promise.all([listarVersoesAdmin(), carregarCatalogoSnap(), catalogoDisciplinasAdmin()]);
  const versao = versoes.find((v) => v.numero === n);
  if (!versao) notFound();

  // O que o lápis do card precisa e não está na tabela da versão.
  const cadastro: Record<string, CadastroCard> = Object.fromEntries(
    cadastroCards.map((c) => [
      c.id,
      {
        codigo: c.codigo,
        categoria: c.categoria,
        icone: c.icone,
        iconeSvg: c.iconeSvg,
        numeracao: c.numeracao,
        numeracaoFim: c.numeracaoFim,
        uso: c.uso,
        versaoDesde: c.versaoDesde,
        versaoAte: c.versaoAte,
      },
    ]),
  );

  return (
    <CatalogoVersaoView
      versao={{ numero: versao.numero, nome: versao.nome, publicada: !!versao.publicadaEm, projetosFixados: versao.projetosFixados }}
      versoes={versoes.map((v) => ({ numero: v.numero, nome: v.nome, publicadaEm: v.publicadaEm, sequenciaPor: v.sequenciaPor }))}
      catalogo={catalogoNaVersao(snap, n)}
      snap={snap}
      cadastro={cadastro}
      categorias={[...new Set(cadastroCards.map((c) => c.categoria).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "pt-BR"))}
      aba={ABAS.includes(aba as AbaCatalogo) ? (aba as AbaCatalogo) : "disciplinas"}
      podeGerir={podeGerir}
      podeEditarCard={podeEditarCard}
    />
  );
}
