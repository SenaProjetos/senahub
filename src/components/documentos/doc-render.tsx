import type { DocSchema, Banda } from "@/modules/documentos/schema";
import { resolverTexto, type ContextoDados, type Linha } from "@/modules/documentos/tokens";
import { ElementoView } from "@/components/documentos/editor/elemento-view";

/**
 * Render final do documento com dados resolvidos (server-safe).
 * Bandas empilham; a banda detalhe repete por linha da coleção.
 * Página A4 com print CSS — exportação PDF via imprimir do navegador.
 */
export function DocRender({
  schema,
  escalar,
  linhas,
}: {
  schema: DocSchema;
  escalar: ContextoDados["escalar"];
  linhas: Linha[];
}) {
  const larguraUtil =
    schema.pagina.largura - schema.pagina.margem.esquerda - schema.pagina.margem.direita;
  const ctxBase: ContextoDados = { escalar, linhas, pagina: 1, paginas: 1 };

  const ordem: Banda["tipo"][] = ["cabecalho", "cabecalhoPagina", "detalhe", "rodapePagina", "rodape"];
  const bandas = [...schema.bandas].sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo));

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
          if (banda.tipo === "detalhe") {
            const fonte = linhas.length > 0 ? linhas : [];
            return fonte.map((linha, i) => (
              <BandaRender
                key={`${banda.id}_${i}`}
                banda={banda}
                largura={larguraUtil}
                ctx={{ ...ctxBase, linha }}
              />
            ));
          }
          return <BandaRender key={banda.id} banda={banda} largura={larguraUtil} ctx={ctxBase} />;
        })}
      </div>
    </div>
  );
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
