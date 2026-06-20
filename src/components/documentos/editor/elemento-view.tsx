import type { CSSProperties } from "react";
import qrcodeGen from "qrcode-generator";
import type { Elemento, ColunaTabela } from "@/modules/documentos/schema";
import { fonteCss } from "@/modules/documentos/fontes-tipograficas";
import { resolverTexto, type ContextoDados } from "@/modules/documentos/tokens";

/**
 * Render visual de um elemento (usado no editor — texto cru com tokens —
 * e no preview — com `textoResolvido`). JSX puro, funciona em server e client.
 *
 * Para o elemento "tabela", passe `ctx` (contexto de dados) para iterar as
 * linhas da coleção; sem `ctx` (editor), mostra um preview com os tokens crus.
 */
export function ElementoView({
  el,
  textoResolvido,
  ctx,
}: {
  el: Elemento;
  textoResolvido?: string;
  ctx?: ContextoDados;
}) {
  const s = el.estilo;
  const texto = textoResolvido ?? el.texto;
  const borderStyleCss = cssBorderStyle(s.borderStyle);
  const familia = fonteCss(s.fontFamily);

  const base: CSSProperties = {
    width: "100%",
    height: "100%",
    fontSize: s.fontSize,
    fontFamily: familia,
    fontWeight: s.bold ? 700 : 400,
    fontStyle: s.italic ? "italic" : "normal",
    textAlign: s.align,
    color: s.color || undefined,
    background: s.bg || undefined,
    border: s.borderW > 0 ? `${s.borderW}px ${borderStyleCss} ${s.borderColor}` : undefined,
    borderRadius: s.radius || undefined,
    overflow: "hidden",
    lineHeight: 1.25,
  };

  switch (el.tipo) {
    case "linha":
      // Linha desenhada como borda superior (respeita estilo solida/tracejada/pontilhada).
      return (
        <div
          style={{
            ...base,
            background: "transparent",
            border: undefined,
            borderTop: `${Math.max(1, s.borderW || el.h || 2)}px ${borderStyleCss} ${
              s.bg || s.borderColor || "#1C2D58"
            }`,
          }}
        />
      );
    case "retangulo":
      return <div style={base} />;
    case "imagem":
      return texto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={texto}
          alt=""
          style={{ ...base, objectFit: "contain", display: "block" }}
          draggable={false}
        />
      ) : (
        <div style={{ ...base, border: "1px dashed #999" }} />
      );
    case "paragrafo":
      return (
        <div
          style={{
            ...base,
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            overflow: "hidden",
          }}
        >
          {texto}
        </div>
      );
    case "assinatura":
      return (
        <div
          style={{
            ...base,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            alignItems: "stretch",
            gap: 4,
            textAlign: "center",
          }}
        >
          <div style={{ borderTop: `1px solid ${s.borderColor || "#1C2D58"}` }} />
          <span style={{ fontSize: s.fontSize, textAlign: "center" }}>{texto}</span>
        </div>
      );
    case "tabela":
      return <TabelaView el={el} base={base} borderColor={s.borderColor || "#1C2D58"} ctx={ctx} />;
    case "qrcode":
      return <QrCodeView texto={texto} base={base} />;
    case "label":
    case "campo":
    default:
      return (
        <div style={{ ...base, display: "flex", alignItems: "center", justifyContent: alinhar(s.align) }}>
          <span style={{ width: "100%" }}>{texto}</span>
        </div>
      );
  }
}

/**
 * Render do elemento tabela: itera as linhas da coleção (`ctx.linhas`) e, para
 * cada coluna, resolve seu `campo` (token) no contexto daquela linha. Sem `ctx`
 * (editor), exibe os tokens crus em uma linha de exemplo.
 */
function TabelaView({
  el,
  base,
  borderColor,
  ctx,
}: {
  el: Elemento;
  base: CSSProperties;
  borderColor: string;
  ctx?: ContextoDados;
}) {
  const colunas: ColunaTabela[] = el.colunas ?? [];
  const cell: CSSProperties = {
    border: `0.5px solid ${borderColor}`,
    padding: "2px 4px",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  };

  if (colunas.length === 0) {
    return (
      <div style={{ ...base, display: "flex", alignItems: "center", justifyContent: "center", border: `1px dashed ${borderColor}`, color: "#999" }}>
        <span>Tabela sem colunas</span>
      </div>
    );
  }

  const totalLargura = colunas.reduce((s, c) => s + (c.largura > 0 ? c.largura : 1), 0);
  // Sem ctx (editor): mostra uma linha de exemplo com os tokens crus.
  const linhas = ctx ? ctx.linhas : [null];

  return (
    <table
      style={{
        ...base,
        display: "table",
        borderCollapse: "collapse",
        tableLayout: "fixed",
        background: el.estilo.bg || undefined,
      }}
    >
      <colgroup>
        {colunas.map((c, i) => (
          <col key={i} style={{ width: `${((c.largura > 0 ? c.largura : 1) / totalLargura) * 100}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {colunas.map((c, i) => (
            <th
              key={i}
              style={{
                ...cell,
                textAlign: c.align,
                fontWeight: 700,
                background: "rgba(28,45,88,0.06)",
              }}
            >
              {c.titulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha, ri) => (
          <tr key={ri}>
            {colunas.map((c, ci) => (
              <td key={ci} style={{ ...cell, textAlign: c.align, fontWeight: 400 }}>
                {ctx && linha
                  ? resolverTexto(c.campo, { ...ctx, linha })
                  : c.campo}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Render de um QR Code a partir do texto já resolvido (tokens). Usa
 * `qrcode-generator` (JS puro, síncrono) com `createSvgTag` — sem canvas, então
 * funciona tanto no SSR (doc-render) quanto no client (editor). O SVG é gerado
 * como `scalable` e injetado via dangerouslySetInnerHTML num quadrado w×h
 * (usamos o menor lado para manter o aspecto). Texto vazio → placeholder discreto.
 */
function QrCodeView({ texto, base }: { texto: string; base: CSSProperties }) {
  const conteudo = texto.trim();
  const wrapper: CSSProperties = {
    ...base,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: base.background || "#fff",
  };

  if (!conteudo) {
    return (
      <div
        style={{
          ...wrapper,
          border: base.border ?? "1px dashed #999",
          color: "#999",
          fontSize: 10,
          textAlign: "center",
        }}
      >
        <span>QR Code</span>
      </div>
    );
  }

  let svg = "";
  try {
    const qr = qrcodeGen(0, "M");
    qr.addData(conteudo);
    qr.make();
    // `scalable` faz o SVG escalar via viewBox; margin pequena para "quiet zone".
    svg = qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
  } catch {
    return (
      <div style={{ ...wrapper, border: "1px dashed #c00", color: "#c00", fontSize: 10 }}>
        <span>QR inválido</span>
      </div>
    );
  }

  // O SVG da lib já traz viewBox + preserveAspectRatio (xMinYMin). Injetamos só
  // um style p/ preencher o quadrado w×h e trocamos o alinhamento p/ centralizar.
  const html = svg
    .replace("<svg", '<svg style="width:100%;height:100%;display:block"')
    .replace('preserveAspectRatio="xMinYMin meet"', 'preserveAspectRatio="xMidYMid meet"');

  return (
    <div
      style={wrapper}
      // O SVG gerado é estático/sanitizado pela lib (apenas módulos pretos/brancos).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function alinhar(a: "left" | "center" | "right") {
  return a === "center" ? "center" : a === "right" ? "flex-end" : "flex-start";
}

function cssBorderStyle(b: "solida" | "tracejada" | "pontilhada"): "solid" | "dashed" | "dotted" {
  return b === "tracejada" ? "dashed" : b === "pontilhada" ? "dotted" : "solid";
}
