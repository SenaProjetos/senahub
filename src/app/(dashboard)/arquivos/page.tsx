import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { parseListParams } from "@/lib/list-params";
import { podeVerTodasDisciplinas } from "@/modules/arquivos/acesso";
import { arvoreGlobalArquivos } from "@/modules/arquivos/arvore-global-queries";
import { campoOrdenacaoDocValido, listarDocumentosAgrupados } from "@/modules/uploads/documentos-agrupados";
import { PainelLateralDocumentos } from "@/components/projetos/arquivos/painel-lateral-documentos";
import { ArvoreGlobalView } from "@/components/arquivos/arvore-global-view";
import { TabelaGlobalArquivos, type ProjetoDaLinha } from "@/components/arquivos/tabela-global";
import { BuscaGlobal } from "@/components/arquivos/busca-global";
import { Pagination } from "@/components/ui/pagination";

export const metadata: Metadata = { title: "Arquivos" };

type Params = Record<string, string | string[] | undefined>;

export default async function ArquivosDiretorioPage({ searchParams }: { searchParams?: Promise<Params> }) {
  const user = await requirePermission("arquivos", "ver");
  const sp = (await searchParams) ?? {};
  const texto = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() !== "" ? v : null);

  const [veTodas, podeValidar, podeVerGeral, podeCoordenacao] = await Promise.all([
    podeVerTodasDisciplinas(user),
    can(user, "uploads", "validar"),
    can(user, "arquivos_gerais", "ver"),
    can(user, "coordenacao", "ver"),
  ]);

  const arvore = await arvoreGlobalArquivos(user, veTodas, {
    geral: podeVerGeral,
    lixeira: user.role === "admin",
    // Recebidos vazio aparece na aba do projeto, onde há um projeto só e um botão de enviar.
    // Aqui seriam dezenas de linhas vazias, uma por projeto — a área só entra quando tem algo.
    gerirRecebidos: false,
  });

  // ── O escopo da tabela sai da ÁRVORE, nunca do parâmetro cru ──────────────
  // `listarDocumentosAgrupados` confia em quem chama: ela não refaz `escopoProjeto`. Passar
  // `[sp.projetoId]` direto deixaria alguém ler um projeto fora do escopo só escrevendo o id na
  // URL — a muralha por disciplina barraria um projetista comum, mas não quem tem `veTodas`.
  // Por isso todo id abaixo é conferido contra a árvore, que já nasceu filtrada.
  const projetosDaArvore = arvore.flatMap((ano) =>
    ano.projetos.map((p) => ({ ...p, ano: String(ano.ano) })),
  );
  const anoSelecionado = arvore.some((a) => String(a.ano) === texto(sp.ano)) ? texto(sp.ano) : null;
  const projetoSelecionado =
    projetosDaArvore.find(
      (p) => p.projetoId === texto(sp.projetoId) && (!anoSelecionado || p.ano === anoSelecionado),
    ) ?? null;
  const disciplinaSelecionadaId =
    projetoSelecionado?.disciplinas.some((d) => d.disciplinaId === texto(sp.disciplinaId))
      ? texto(sp.disciplinaId)
      : null;

  const projetoIds = projetoSelecionado
    ? [projetoSelecionado.projetoId]
    : projetosDaArvore.filter((p) => !anoSelecionado || p.ano === anoSelecionado).map((p) => p.projetoId);

  const filtros = {
    disciplinaId: disciplinaSelecionadaId,
    // Fase e extensão são chaves de filtro: id inválido devolve lista vazia, não vaza escopo.
    fase: texto(sp.fase) ?? undefined,
    ext: texto(sp.ext) ?? undefined,
    q: texto(sp.q) ?? undefined,
  };
  const lp = parseListParams(sp, { sortFields: ["nome", "data", "disciplina", "numero", "tamanho"], defaultSort: "data" });

  const pagina = await listarDocumentosAgrupados({
    projetoIds,
    userId: user.id,
    veTodas,
    ehGlobal: false,
    podeEnviarCap: false,
    podeEditarMetadados: false,
    podeAlterarStatus: false,
    filtros,
    skip: lp.skip,
    take: lp.take,
    sort: campoOrdenacaoDocValido(lp.sort),
    dir: lp.dir,
  });

  const projetosPorId = new Map<string, ProjetoDaLinha>(
    projetosDaArvore.map((p) => [p.projetoId, { id: p.projetoId, codigo: p.codigo, nome: p.nome }]),
  );
  const temFiltro = !!(filtros.q || filtros.fase || filtros.ext || disciplinaSelecionadaId || projetoSelecionado || anoSelecionado);
  const escopo = projetoSelecionado
    ? `${projetoSelecionado.codigo} · ${projetoSelecionado.nome}`
    : anoSelecionado
      ? `Ano ${anoSelecionado}`
      : "Todos os projetos";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Arquivos</h1>
        <p className="text-sm text-muted-foreground">
          Diretório de todos os projetos, em pastas: ano → projeto → disciplina → fase → formato.
          {!veTodas && " Mostrando apenas as disciplinas onde você é responsável."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <PainelLateralDocumentos>
          <ArvoreGlobalView
            arvore={arvore}
            selecao={{
              ano: anoSelecionado,
              projetoId: projetoSelecionado?.projetoId ?? null,
              disciplinaId: disciplinaSelecionadaId,
              fase: filtros.fase ?? null,
              ext: filtros.ext ?? null,
            }}
          />
        </PainelLateralDocumentos>

        <main className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {escopo}
              <span className="ml-2 font-normal tabular-nums text-muted-foreground">
                {pagina.total} {pagina.total === 1 ? "documento" : "documentos"}
              </span>
            </p>
            <BuscaGlobal />
          </div>

          <TabelaGlobalArquivos
            linhas={pagina.linhas}
            projetos={projetosPorId}
            podeValidar={podeValidar}
            podeCoordenacao={podeCoordenacao}
            temFiltro={temFiltro}
          />

          {pagina.total > lp.take && (
            <Pagination
              page={pagina.pagina}
              pageCount={Math.max(1, Math.ceil(pagina.total / lp.take))}
              pageSize={lp.take}
              total={pagina.total}
            />
          )}
        </main>
      </div>
    </div>
  );
}
