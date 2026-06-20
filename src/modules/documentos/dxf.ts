import type { DocSchema, Banda } from "@/modules/documentos/schema";
import { resolverTexto, type ContextoDados, type Linha } from "@/modules/documentos/tokens";

/**
 * Exportador DXF (AutoCAD R12 ASCII) do layout do Estúdio — foco em carimbo/selo de prancha.
 * Conversão: editor usa px @96dpi com Y para BAIXO e origem no topo-esquerdo; DXF usa mm com Y
 * para CIMA. Fator px→mm = 25.4/96; Y invertido pela altura da página. Imagens são ignoradas
 * (DXF não embute raster facilmente) — viram um TEXT "[imagem]" como referência de posição.
 *
 * Entidades usadas (compatíveis com R12, importáveis em qualquer CAD):
 * - TEXT  (label/campo/paragrafo/assinatura)
 * - LINE  (linha; retângulo = 4 LINEs)
 */

const PX_TO_MM = 25.4 / 96;
const ORDEM: Banda["tipo"][] = ["cabecalho", "cabecalhoPagina", "detalhe", "rodapePagina", "rodape"];

function mm(px: number): number {
  return +(px * PX_TO_MM).toFixed(3);
}

type Entidade = string[];

function text(x: number, y: number, h: number, conteudo: string): Entidade {
  // DXF não lida bem com quebras de linha num único TEXT; troca por espaço.
  const t = conteudo.replace(/\r?\n/g, " ");
  return ["0", "TEXT", "8", "0", "10", String(x), "20", String(y), "40", String(h), "1", t];
}

function line(x1: number, y1: number, x2: number, y2: number): Entidade {
  return ["0", "LINE", "8", "0", "10", String(x1), "20", String(y1), "11", String(x2), "21", String(y2)];
}

function retangulo(x: number, y: number, w: number, h: number): Entidade[] {
  // y já é o canto INFERIOR (após inversão) — desenha as 4 arestas.
  const x2 = x + w;
  const y2 = y + h;
  return [line(x, y, x2, y), line(x2, y, x2, y2), line(x2, y2, x, y2), line(x, y2, x, y)];
}

/**
 * Gera o DXF do documento. Se `dados` for informado, os tokens são resolvidos; caso contrário,
 * usa o texto cru dos elementos (útil p/ exportar o carimbo como gabarito).
 */
export function gerarDxf(
  schema: DocSchema,
  dados?: { escalar: ContextoDados["escalar"]; linhas: Linha[] },
): string {
  const alturaPx = schema.pagina.altura;
  const ctxBase: ContextoDados = {
    escalar: dados?.escalar ?? {},
    linhas: dados?.linhas ?? [],
    pagina: 1,
    paginas: 1,
  };

  // Y de tela (px, topo→baixo) → Y de DXF (mm, baixo→cima).
  const yMm = (yTelaPx: number) => mm(alturaPx - yTelaPx);

  const entidades: Entidade[] = [];
  const bandas = [...schema.bandas].sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo));

  let offsetY = schema.pagina.margem.topo; // px acumulado do topo da página
  const offsetX = schema.pagina.margem.esquerda;

  const emitirBanda = (banda: Banda, ctx: ContextoDados, baseY: number) => {
    for (const el of banda.elementos) {
      if (!el.visivel) continue;
      const xTela = offsetX + el.x;
      const yTopoTela = baseY + el.y;
      const xMm = mm(xTela);

      if (el.tipo === "linha") {
        // linha horizontal na espessura do elemento → uma LINE no topo
        entidades.push(line(xMm, yMm(yTopoTela), mm(xTela + el.w), yMm(yTopoTela)));
      } else if (el.tipo === "retangulo") {
        // canto inferior em DXF = yTopoTela + h (mais para baixo na tela)
        entidades.push(...retangulo(xMm, yMm(yTopoTela + el.h), mm(el.w), mm(el.h)));
      } else if (el.tipo === "imagem") {
        entidades.push(text(xMm, yMm(yTopoTela + el.h), mm(10), "[imagem]"));
      } else {
        // label / campo / paragrafo / assinatura → TEXT (tokens resolvidos; texto cru se sem dados)
        const conteudo = resolverTexto(el.texto, ctx);
        const alturaTexto = mm(el.estilo.fontSize);
        // baseline do TEXT fica na parte de baixo do elemento
        entidades.push(text(xMm, yMm(yTopoTela + el.estilo.fontSize), alturaTexto, conteudo));
      }
    }
  };

  for (const banda of bandas) {
    if (banda.tipo === "detalhe") {
      const linhas = ctxBase.linhas.length > 0 ? ctxBase.linhas : [];
      if (linhas.length === 0) {
        emitirBanda(banda, ctxBase, offsetY);
        offsetY += banda.altura;
      } else {
        for (const linha of linhas) {
          emitirBanda(banda, { ...ctxBase, linha }, offsetY);
          offsetY += banda.altura;
        }
      }
    } else {
      emitirBanda(banda, ctxBase, offsetY);
      offsetY += banda.altura;
    }
  }

  const corpo = entidades.flat();
  return [
    "0", "SECTION", "2", "HEADER", "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    ...corpo,
    "0", "ENDSEC",
    "0", "EOF",
    "",
  ].join("\n");
}
