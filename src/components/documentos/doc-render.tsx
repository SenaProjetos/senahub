import type { DocSchema, Banda } from "@/modules/documentos/schema";
import { resolverTexto, type ContextoDados, type Escalar, type Linha } from "@/modules/documentos/tokens";
import { avaliarCondicao } from "@/modules/documentos/condicoes";
import { ElementoView } from "@/components/documentos/editor/elemento-view";

/** Dados de uma fonte (escalar + linhas) — espelha DadosResolvidos sem server-only. */
type DadosFonte = { escalar: Escalar; linhas: Linha[] };

/**
 * Render final do documento com dados resolvidos (server-safe).
 * Bandas empilham; a banda detalhe repete por linha da coleção.
 * Página A4 com print CSS — exportação PDF via imprimir do navegador.
 *
 * MULTI-COLEÇÃO: `escalar`/`linhas` são da fonte PRIMÁRIA. Quando uma banda de
 * detalhe/grupo tem `fonteId` próprio, suas linhas/escalar vêm de `porFonte`
 * (sub-relatório). Sem `porFonte` ou sem `fonteId` nas bandas → idêntico ao
 * comportamento original (retrocompat).
 */
export function DocRender({
  schema,
  escalar,
  linhas,
  porFonte,
}: {
  schema: DocSchema;
  escalar: ContextoDados["escalar"];
  linhas: Linha[];
  /** Mapa fonteId → {escalar, linhas} de todas as fontes usadas (opcional). */
  porFonte?: Record<string, DadosFonte>;
}) {
  const larguraUtil =
    schema.pagina.largura - schema.pagina.margem.esquerda - schema.pagina.margem.direita;
  const ctxBase: ContextoDados = { escalar, linhas, pagina: 1, paginas: 1 };

  /**
   * Resolve os dados (escalar + linhas) que alimentam uma banda de detalhe/grupo:
   * se a banda declara `fonteId` e há dados dessa fonte em `porFonte`, usa-os
   * (merge do escalar da fonte da banda SOBRE o primário, p/ `[Campo]` resolver
   * da fonte certa; `[Fonte.Campo]` já tem prefixo). Senão, usa os primários.
   */
  const dadosDaBanda = (banda: Banda): { escalar: Escalar; linhas: Linha[] } => {
    const fid = banda.fonteId?.trim();
    if (fid && porFonte && porFonte[fid]) {
      const d = porFonte[fid];
      return { escalar: { ...escalar, ...d.escalar }, linhas: d.linhas };
    }
    return { escalar, linhas };
  };

  const ordem: Banda["tipo"][] = [
    "cabecalho",
    "cabecalhoPagina",
    "grupoCabecalho",
    "detalhe",
    "grupoRodape",
    "rodapePagina",
    "rodape",
  ];
  const bandas = [...schema.bandas].sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo));

  // Agrupamento da coleção: ativo só quando há chave `agruparPor` E uma banda detalhe.
  const agruparPor = schema.agruparPor?.trim();
  const bandaDetalhe = bandas.find((b) => b.tipo === "detalhe");
  const bandaGrupoCab = bandas.find((b) => b.tipo === "grupoCabecalho");
  const bandaGrupoRod = bandas.find((b) => b.tipo === "grupoRodape");
  const agrupado = !!agruparPor && !!bandaDetalhe;
  // MULTI-COLEÇÃO: o agrupamento e as bandas de grupo operam sobre as linhas da
  // FONTE DA BANDA DE DETALHE (sub-relatório), não necessariamente a primária.
  const dadosDetalhe = bandaDetalhe ? dadosDaBanda(bandaDetalhe) : { escalar, linhas };
  // Grupos por valor da chave, preservando a ordem de primeira aparição.
  const grupos = agrupado ? agruparLinhas(dadosDetalhe.linhas, agruparPor!) : [];

  const marca = schema.pagina.marcaDagua;
  const marcaTexto = marca?.texto?.trim();

  return (
    <div
      className="doc-pagina relative mx-auto bg-white text-black shadow"
      style={{
        width: schema.pagina.largura,
        minHeight: schema.pagina.altura,
        paddingTop: schema.pagina.margem.topo,
        paddingBottom: schema.pagina.margem.baixo,
        paddingLeft: schema.pagina.margem.esquerda,
        paddingRight: schema.pagina.margem.direita,
      }}
    >
      {marcaTexto && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            pointerEvents: "none",
            // garante impressão da cor de fundo da marca
            WebkitPrintColorAdjust: "exact",
            printColorAdjust: "exact",
          }}
        >
          <span
            style={{
              transform: "rotate(-30deg)",
              fontSize: Math.max(48, Math.round(schema.pagina.largura / 8)),
              fontWeight: 700,
              color: "#000",
              opacity: marca?.opacidade ?? 0.08,
              whiteSpace: "nowrap",
              userSelect: "none",
              textAlign: "center",
              lineHeight: 1,
            }}
          >
            {marcaTexto}
          </span>
        </div>
      )}
      <div className="relative" style={{ zIndex: 1 }}>
        {bandas.map((banda) => {
          // Com agrupamento ativo, as bandas de grupo são renderizadas dentro do
          // bloco da detalhe (uma vez por grupo); aqui pulamos as soltas.
          if (agrupado && (banda.tipo === "grupoCabecalho" || banda.tipo === "grupoRodape")) {
            return null;
          }

          if (banda.tipo === "detalhe") {
            // MULTI-COLEÇÃO: ctx desta banda usa o escalar+linhas da SUA fonte
            // (merge do escalar da fonte sobre o primário em dadosDaBanda).
            const ctxDet: ContextoDados = {
              ...ctxBase,
              escalar: dadosDetalhe.escalar,
              linhas: dadosDetalhe.linhas,
            };
            // Sem agrupamento: comportamento original — detalhe repete por linha.
            if (!agrupado) {
              return dadosDetalhe.linhas.map((linha, i) => (
                <BandaRender
                  key={`${banda.id}_${i}`}
                  banda={banda}
                  largura={larguraUtil}
                  ctx={{ ...ctxDet, linha }}
                />
              ));
            }
            // Com agrupamento: para cada grupo →
            //   grupoCabecalho (ctx do grupo) → linhas (detalhe) → grupoRodape (subtotais).
            // Em ambas as bandas de grupo, ctx.linhas = linhas DO grupo (subtotal por grupo)
            // e ctx.grupo = valor da chave (token [Grupo]).
            return grupos.map((g) => {
              const ctxGrupo: ContextoDados = {
                ...ctxDet,
                linhas: g.linhas,
                grupo: g.chave,
              };
              return (
                <div key={`grp_${g.chave}`}>
                  {bandaGrupoCab && (
                    <BandaRender
                      key={`${bandaGrupoCab.id}_${g.chave}`}
                      banda={bandaGrupoCab}
                      largura={larguraUtil}
                      ctx={ctxGrupo}
                    />
                  )}
                  {g.linhas.map((linha, i) => (
                    <BandaRender
                      key={`${banda.id}_${g.chave}_${i}`}
                      banda={banda}
                      largura={larguraUtil}
                      // Detalhe: linha atual + chave do grupo ([Grupo]); agregados na
                      // detalhe seguem operando sobre a coleção inteira da fonte da banda.
                      ctx={{ ...ctxDet, linha, grupo: g.chave }}
                    />
                  ))}
                  {bandaGrupoRod && (
                    <BandaRender
                      key={`${bandaGrupoRod.id}_${g.chave}`}
                      banda={bandaGrupoRod}
                      largura={larguraUtil}
                      ctx={ctxGrupo}
                    />
                  )}
                </div>
              );
            });
          }

          return <BandaRender key={banda.id} banda={banda} largura={larguraUtil} ctx={ctxBase} />;
        })}
      </div>
    </div>
  );
}

/**
 * Agrupa as linhas por `linha[chave]`, preservando a ordem de primeira aparição
 * do valor do grupo. O valor da chave é normalizado para string (rótulo do grupo).
 */
function agruparLinhas(linhas: Linha[], chave: string): { chave: string; linhas: Linha[] }[] {
  const mapa = new Map<string, Linha[]>();
  const ordem: string[] = [];
  for (const linha of linhas) {
    const bruto = linha[chave];
    const k = bruto === null || bruto === undefined ? "" : String(bruto);
    if (!mapa.has(k)) {
      mapa.set(k, []);
      ordem.push(k);
    }
    mapa.get(k)!.push(linha);
  }
  return ordem.map((k) => ({ chave: k, linhas: mapa.get(k)! }));
}

function BandaRender({
  banda,
  largura,
  ctx,
}: {
  banda: Banda;
  largura: number;
  ctx: ContextoDados;
}) {
  return (
    <div className="relative" style={{ width: largura, height: banda.altura, breakInside: "avoid" }}>
      {banda.elementos
        .filter((e) => e.visivel)
        // Condição opcional: oculta o elemento quando a expressão é falsa.
        // Sem condição (undefined/"") → avaliarCondicao retorna true.
        .filter((e) => avaliarCondicao(e.condicao, ctx))
        .map((el) => (
          <div key={el.id} className="absolute" style={{ left: el.x, top: el.y, width: el.w, height: el.h }}>
            <ElementoView
              el={el}
              ctx={el.tipo === "tabela" ? ctx : undefined}
              textoResolvido={
                el.tipo === "imagem" || el.tipo === "tabela" ? el.texto : resolverTexto(el.texto, ctx)
              }
            />
          </div>
        ))}
    </div>
  );
}
