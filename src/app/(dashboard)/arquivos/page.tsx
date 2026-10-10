import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { parseListParams } from "@/lib/list-params";
import { porPaginaDaLista } from "@/modules/usuarios/preferencias/por-pagina";
import { podeVerTodasDisciplinas } from "@/modules/arquivos/acesso";
import { arvoreGlobalArquivos } from "@/modules/arquivos/arvore-global-queries";
import { pastasGlobais, rotuloProjeto, trilhaGlobal, type AnoDoDiretorio } from "@/modules/arquivos/pastas-globais";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { campoOrdenacaoDocValido, listarDocumentosAgrupados } from "@/modules/uploads/documentos-agrupados";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { QuadroAlturaTela } from "@/components/ui/quadro-altura-tela";
import { BotaoPastas, PainelLateralDocumentos } from "@/components/projetos/arquivos/painel-lateral-documentos";
import { TabelaPastas, TrilhaPastas } from "@/components/projetos/arquivos/pastas-na-lista";
import { TelaDocumentosProjeto, type ParamsTelaDocumentos } from "@/components/projetos/arquivos/tela-documentos-projeto";
import { ArvoreProjetos } from "@/components/arquivos/arvore-projetos";
import { TabelaGlobalArquivos, type ProjetoDaLinha } from "@/components/arquivos/tabela-global";
import { BuscaGlobal } from "@/components/arquivos/busca-global";

export const metadata: Metadata = { title: "Arquivos" };

type Params = ParamsTelaDocumentos & { ano?: string; projetoId?: string };

/**
 * Diretório geral: os arquivos de todos os projetos, navegados como a aba Arquivos de cada um
 * (pedido do dono, 2026-09-29: "/arquivos deve sempre seguir o padrão de /projetos/id/arquivos").
 *
 *   Todos os projetos → ano → projeto → (a aba Arquivos do projeto, a MESMA tela)
 *
 * Acima do projeto a lista só tem pastas (anos, projetos) e a busca procura em todos. Com um
 * projeto aberto, a página mostra `TelaDocumentosProjeto` — o que a aba do projeto mostra, com
 * as mesmas ações e permissões —, e a árvore de anos envolve as pastas dele.
 */
export default async function ArquivosDiretorioPage({ searchParams }: { searchParams?: Promise<Params> }) {
  const user = await requirePermission("arquivos", "ver");
  const sp: Params = (await searchParams) ?? {};
  const texto = (v: string | undefined) => (typeof v === "string" && v.trim() !== "" ? v : null);

  const [veTodas, podeVerGeral, podeCoordenacao] = await Promise.all([
    podeVerTodasDisciplinas(user),
    can(user, "arquivos_gerais", "ver"),
    can(user, "coordenacao", "ver"),
  ]);
  const arvore = await arvoreGlobalArquivos(user, veTodas, {
    geral: podeVerGeral,
    lixeira: user.superUsuario,
    gerirRecebidos: false,
  });
  const anos: AnoDoDiretorio[] = arvore.map((a) => ({
    ano: a.ano,
    total: a.total,
    projetos: a.projetos.map((p) => ({ projetoId: p.projetoId, codigo: p.codigo, nome: p.nome, total: p.total })),
  }));

  // ── Ano e projeto saem da ÁRVORE, nunca do parâmetro cru ────────────────────────────────────
  // A árvore nasceu do escopo do usuário; um id escrito à mão na URL que não esteja nela não abre
  // nada. O projeto ainda passa por `projetoVisivel`, a mesma porta da aba do projeto.
  // Link só com o projeto (sem o ano) também abre: o ano sai da árvore.
  const anoDoProjeto = anos.find((a) => a.projetos.some((p) => p.projetoId === texto(sp.projetoId)));
  const anoSelecionado = anos.some((a) => String(a.ano) === texto(sp.ano))
    ? texto(sp.ano)
    : anoDoProjeto
      ? String(anoDoProjeto.ano)
      : null;
  const doAno = anos.find((a) => String(a.ano) === anoSelecionado);
  const projetoDaArvore = doAno?.projetos.find((p) => p.projetoId === texto(sp.projetoId)) ?? null;
  const projeto = projetoDaArvore ? await projetoVisivel(user, projetoDaArvore.projetoId) : null;

  const cabecalho = (
    <CabecalhoPagina
      titulo="Arquivos"
      descricao={
        veTodas
          ? "Os arquivos de todos os projetos, em pastas por ano e projeto."
          : "Os arquivos dos seus projetos, só nas disciplinas em que você é responsável."
      }
    />
  );

  if (anoSelecionado && projeto) {
    const naRaizDoProjeto = !texto(sp.disciplinaId) && !texto(sp.area) && !texto(sp.listaId);
    return (
      <div className="space-y-4">
        {cabecalho}
        <TelaDocumentosProjeto
          user={user}
          projeto={projeto}
          sp={sp}
          moldura={{
            arvore: (doProjeto) => (
              <ArvoreProjetos
                anos={anos}
                selecao={{ ano: anoSelecionado, projetoId: projeto.id, naRaizDoProjeto }}
                doProjeto={doProjeto}
              />
            ),
            trilhaAcima: trilhaGlobal(anoSelecionado, { projetoId: projeto.id }),
            rotuloRaiz: rotuloProjeto(projeto),
          }}
        />
      </div>
    );
  }

  // ── Acima do projeto: pastas (anos, ou os projetos do ano) e a busca em todos ───────────────
  const q = texto(sp.q);
  const projetoIds = (doAno ? doAno.projetos : anos.flatMap((a) => a.projetos)).map((p) => p.projetoId);
  const lp = parseListParams(sp, { sortFields: ["nome", "data", "disciplina", "numero", "tamanho"], defaultSort: "data", defaultPageSize: await porPaginaDaLista("arquivos") });
  const resultado = q
    ? await listarDocumentosAgrupados({
        projetoIds,
        userId: user.id,
        veTodas,
        ehGlobal: false,
        podeEnviarCap: false,
        podeEditarMetadados: false,
        podeAlterarStatus: false,
        filtros: { q },
        skip: lp.skip,
        take: lp.take,
        sort: campoOrdenacaoDocValido(lp.sort),
        dir: lp.dir,
      })
    : null;
  const projetosPorId = new Map<string, ProjetoDaLinha>(
    anos.flatMap((a) => a.projetos).map((p) => [p.projetoId, { id: p.projetoId, codigo: p.codigo, nome: p.nome }]),
  );

  return (
    <div className="space-y-4">
      {cabecalho}
      <QuadroAlturaTela folga={40} className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr] md:items-start">
        <PainelLateralDocumentos>
          <ArvoreProjetos anos={anos} selecao={{ ano: anoSelecionado, projetoId: null, naRaizDoProjeto: false }} />
        </PainelLateralDocumentos>

        <main className="min-w-0 space-y-3 md:flex md:h-full md:min-h-0 md:flex-col md:space-y-0 md:gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <BotaoPastas />
            <div className="min-w-0 flex-1 basis-60">
              <BuscaGlobal />
            </div>
          </div>
          <TrilhaPastas trilha={[]} inicio={trilhaGlobal(anoSelecionado, null)} rotuloRaiz={anoSelecionado ?? "Todos os projetos"} />
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
            {resultado ? (
              // Busca em vários projetos: lista corrida, com a coluna do projeto de cada documento.
              <TabelaGlobalArquivos
                linhas={resultado.linhas}
                projetos={projetosPorId}
                podeCoordenacao={podeCoordenacao}
                temFiltro
                paginacao={{
                  page: resultado.pagina,
                  pageCount: Math.max(1, Math.ceil(resultado.total / lp.take)),
                  pageSize: lp.take,
                  total: resultado.total,
                }}
              />
            ) : (
              <TabelaPastas
                pastas={pastasGlobais(anoSelecionado, anos)}
                vazio={
                  anoSelecionado
                    ? { title: "Nenhum projeto neste ano", description: "Escolha outro ano no painel ao lado." }
                    : { title: "Nenhum projeto com arquivos", description: "Os projetos que você pode ver ainda não têm documentos." }
                }
              />
            )}
          </div>
        </main>
      </QuadroAlturaTela>
    </div>
  );
}
