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

  return (
    <div
      className="doc-pagina mx-auto bg-white text-black shadow"
      style={{
        width: schema.pagina.largura,
        minHeight: schema.pagina.altura,
        paddingTop: schema.pagina.margem.topo,
        paddingBottom: schema.pagina.margem.baixo,
        paddingLeft: schema.pagina.margem.esquerda,
        paddingRight: schema.pagina.margem.direita,
      }}
    >
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
              textoResolvido={
                el.tipo === "imagem" ? el.texto : resolverTexto(el.texto, ctx)
              }
            />
          </div>
        ))}
    </div>
  );
}
