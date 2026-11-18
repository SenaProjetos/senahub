import type { EmpresaTimbrado } from "@/modules/configuracoes/empresa/timbrado";

/**
 * Timbrado da empresa no relatório (Configurações → Empresa: razão social, CNPJ, endereço e logo) — **puro**. O PDF recebe o
 * cabeçalho nativo do Chrome (repetido em toda página); o Word e o Excel recebem o logo e as linhas pelos auxiliares daqui. Sem
 * timbrado (`null`, ninguém preencheu a tela) o relatório sai como antes, sem cabeçalho.
 */

/** "CNPJ 00.000.000/0001-00 · Rua tal, 100" — as linhas abaixo da razão social; `null` quando não há nenhuma. */
export function linhaDoTimbrado(e: EmpresaTimbrado): string | null {
  const partes = [e.cnpj ? `CNPJ ${e.cnpj}` : null, e.endereco].filter((x): x is string => !!x);
  return partes.length > 0 ? partes.join(" · ") : null;
}

export type LogoDoTimbrado = { tipo: "png"; dados: Buffer; largura: number; altura: number };

const ALTURA_MAXIMA = 40;
const LARGURA_MAXIMA = 130;

/**
 * Logo como bytes e tamanho em pixels, reduzido para caber no cabeçalho sem mudar a proporção. O logo é sempre PNG (o envio o
 * normaliza); qualquer outra coisa, ou um PNG ilegível, vira `null` e o relatório sai só com o texto.
 */
export function logoDoTimbrado(e: EmpresaTimbrado | null): LogoDoTimbrado | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(e?.logoDataUri ?? "");
  if (!m) return null;
  const dados = Buffer.from(m[1], "base64");
  // PNG: assinatura de 8 bytes, depois o bloco IHDR (largura e altura em 4 bytes cada, big-endian, a partir do byte 16).
  if (dados.length < 24 || dados.readUInt32BE(0) !== 0x89504e47 || dados.toString("ascii", 12, 16) !== "IHDR") return null;
  const w = dados.readUInt32BE(16);
  const h = dados.readUInt32BE(20);
  if (!(w > 0) || !(h > 0)) return null;
  const escala = Math.min(1, ALTURA_MAXIMA / h, LARGURA_MAXIMA / w);
  return { tipo: "png", dados, largura: Math.max(1, Math.round(w * escala)), altura: Math.max(1, Math.round(h * escala)) };
}

/** Faixa que o cabeçalho do PDF ocupa em cada página (o `@page` do HTML manda na margem; `!important` pela mesma razão do rodapé do Estúdio). */
const MARGEM_COM_TIMBRADO = "34mm 16mm 18mm";

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Cabeçalho nativo do Chrome com o timbrado (logo, razão social, CNPJ · endereço e filete), repetido em TODA página do PDF — como
 * o cabeçalho de página do Word. Só vale junto de `abrirFaixaDoCabecalho`. `null` = sem timbrado, sem cabeçalho.
 */
export function cabecalhoPdfDoTimbrado(e: EmpresaTimbrado | null): string | null {
  if (!e) return null;
  const logo = logoDoTimbrado(e);
  const linha = linhaDoTimbrado(e);
  const img = logo && e.logoDataUri ? `<img src="${e.logoDataUri}" alt="" style="height:${logo.altura}px;width:${logo.largura}px;object-fit:contain;">` : "";
  return (
    '<div style="width:100%;box-sizing:border-box;padding:8mm 16mm 0;font-family:Arial,sans-serif;color:#1a1a1a;-webkit-print-color-adjust:exact;">' +
    '<div style="display:flex;align-items:center;gap:10px;padding-bottom:6px;border-bottom:1px solid #c9d2c5;">' +
    img +
    `<div><div style="font-size:11px;font-weight:700;">${escapar(e.razaoSocial)}</div>` +
    (linha ? `<div style="font-size:8px;color:#52645a;margin-top:2px;">${escapar(linha)}</div>` : "") +
    "</div></div></div>"
  );
}

/** Abre no `@page` do HTML a faixa do cabeçalho. Sem timbrado devolve o HTML intacto. */
export function abrirFaixaDoCabecalho(html: string, e: EmpresaTimbrado | null): string {
  if (!e) return html;
  return html.replace("</style>", `@page { margin: ${MARGEM_COM_TIMBRADO} !important; }</style>`);
}
