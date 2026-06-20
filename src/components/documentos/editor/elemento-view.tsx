import type { CSSProperties } from "react";
import type { Elemento } from "@/modules/documentos/schema";
import { fonteCss } from "@/modules/documentos/fontes-tipograficas";

/**
 * Render visual de um elemento (usado no editor — texto cru com tokens —
 * e no preview — com `textoResolvido`). JSX puro, funciona em server e client.
 */
export function ElementoView({
  el,
  textoResolvido,
}: {
  el: Elemento;
  textoResolvido?: string;
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

function alinhar(a: "left" | "center" | "right") {
  return a === "center" ? "center" : a === "right" ? "flex-end" : "flex-start";
}

function cssBorderStyle(b: "solida" | "tracejada" | "pontilhada"): "solid" | "dashed" | "dotted" {
  return b === "tracejada" ? "dashed" : b === "pontilhada" ? "dotted" : "solid";
}
