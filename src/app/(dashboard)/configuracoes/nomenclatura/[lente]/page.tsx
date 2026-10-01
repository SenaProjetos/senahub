import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigirAcessoNomenclatura } from "@/modules/projetos/nomenclatura/acesso";
import { listarVersoesAdmin } from "@/modules/projetos/nomenclatura/versoes-queries";
import { carregarCatalogoSnap, usoDoCatalogo } from "@/modules/projetos/nomenclatura/catalogo/queries";
import { catalogoNaVersao } from "@/modules/projetos/nomenclatura/catalogo/versao";
import { catalogoTodasVersoes } from "@/modules/projetos/nomenclatura/catalogo/todas";
import { catalogosPranchaConfig } from "@/modules/projetos/pranchas/queries";
import { catalogoDisciplinasAdmin } from "@/modules/projetos/queries";
import { CatalogoVersaoView, type CadastroCard, type AbaCatalogo } from "@/components/configuracoes/catalogo-versao-view";
import { CatalogoTodasView, type AbaTodas } from "@/components/configuracoes/catalogo-todas-view";
import { CatalogoFolhasView } from "@/components/configuracoes/catalogo-folhas-view";
import type { AbaNomenclatura } from "@/components/configuracoes/catalogo/abas-catalogo";

export const metadata: Metadata = { title: "Disciplinas e nomenclatura" };

const ABAS: readonly AbaNomenclatura[] = ["disciplinas", "fases", "tipos", "folhas"];

export default async function CatalogoVersaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ lente: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { podeGerir, podeEditarCard } = await exigirAcessoNomenclatura();
  const { lente } = await params;
  const { aba: abaPedida } = await searchParams;
  // A lente é o número de uma versão ou "todas". "Formatos de folha" é de quem administra a configuração.
  const ehTodas = lente === "todas";
  const n = /^\d+$/.test(lente) ? Number(lente) : NaN;
  if (!ehTodas && (!Number.isInteger(n) || n < 1)) notFound();
  let aba: AbaNomenclatura = ABAS.includes(abaPedida as AbaNomenclatura) ? (abaPedida as AbaNomenclatura) : "disciplinas";
  if (aba === "folhas" && !podeGerir) aba = "disciplinas";

  const [versoes, snap, cadastroCards] = await Promise.all([listarVersoesAdmin(), carregarCatalogoSnap(), catalogoDisciplinasAdmin()]);
  const versao = ehTodas ? undefined : versoes.find((v) => v.numero === n);
  if (!ehTodas && !versao) notFound();

  if (aba === "folhas") {
    const folhas = (await catalogosPranchaConfig(null)).filter((c) => c.categoria === "folha");
    return <CatalogoFolhasView lente={ehTodas ? "todas" : n} folhas={folhas} podeGerir={podeGerir} />;
  }

  // O que o lápis do card precisa e não está na tabela da versão.
  const cadastro: Record<string, CadastroCard> = Object.fromEntries(
    cadastroCards.map((c) => [
      c.id,
      {
        codigo: c.codigo,
        categoria: c.categoria,
        icone: c.icone,
        temIconeSvg: !!c.iconeSvg,
        numeracao: c.numeracao,
        numeracaoFim: c.numeracaoFim,
        uso: c.uso,
        versaoDesde: c.versaoDesde,
        versaoAte: c.versaoAte,
      },
    ]),
  );

  const listaCategorias = [...new Set(cadastroCards.map((c) => c.categoria).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  if (ehTodas) {
    const uso = await usoDoCatalogo();
    return (
      <CatalogoTodasView
        versoes={versoes.map((v) => ({ numero: v.numero, nome: v.nome, publicadaEm: v.publicadaEm, sequenciaPor: v.sequenciaPor }))}
        snap={snap}
        todas={catalogoTodasVersoes(snap, versoes.map((v) => v.numero))}
        cadastro={cadastro}
        usoSubs={uso.subs}
        usoFases={uso.fases}
        categorias={listaCategorias}
        aba={aba as AbaTodas}
        podeGerir={podeGerir}
        podeEditarCard={podeEditarCard}
      />
    );
  }
  if (!versao) notFound();

  return (
    <CatalogoVersaoView
      versao={{ numero: versao.numero, nome: versao.nome, publicada: !!versao.publicadaEm, projetosFixados: versao.projetosFixados }}
      versoes={versoes.map((v) => ({ numero: v.numero, nome: v.nome, publicadaEm: v.publicadaEm, sequenciaPor: v.sequenciaPor }))}
      catalogo={catalogoNaVersao(snap, n)}
      snap={snap}
      cadastro={cadastro}
      categorias={listaCategorias}
      aba={aba as AbaCatalogo}
      podeGerir={podeGerir}
      podeEditarCard={podeEditarCard}
    />
  );
}
