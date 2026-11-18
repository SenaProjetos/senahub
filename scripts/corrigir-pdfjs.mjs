/**
 * Correção local do pdf.js, aplicada no postinstall (depois de `sincronizar-pdf-worker.mjs`).
 *
 * Linha traço-ponto exportada do CAD (AutoCAD etc.) chega no PDF desenhada segmento a segmento, e cada "ponto" é um
 * subcaminho de comprimento zero (`x y m x y l S`) com capa redonda. A especificação do PDF (ISO 32000, 8.5.3.2) manda
 * pintar ali um círculo do diâmetro da linha — o Chrome/Edge (PDFium) e o Acrobat pintam. O pdf.js entrega esse
 * caminho ao canvas, e o canvas do Chrome descarta segmento de comprimento zero (regra do HTML), então a prancha
 * mostrava só os traços.
 *
 * A correção: com capa redonda, o `lineTo` de comprimento zero logo depois do `moveTo` anda um tantinho (proporcional à
 * coordenada, para sobreviver ao float32 do canvas). O segmento passa a existir e o canvas desenha as duas capas
 * redondas — o círculo. Capa reta/quadrada fica como está (a especificação não pinta o ponto nesses casos).
 *
 * Nunca derruba a instalação (o deploy roda `npm ci` com o site parado): se um upgrade do pdf.js mudar o trecho, só
 * avisa, e `src/lib/pdfjs-ponto-degenerado.test.ts` falha até a correção ser refeita (ou removida, se o pdf.js
 * passar a tratar o caso).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ARQUIVO = resolve("node_modules/pdfjs-dist/build/pdf.mjs");
const MARCA = "SENAHUB:ponto-degenerado";

const TROCAS = [
  {
    nome: "makePathFromDrawOPS",
    de: `function makePathFromDrawOPS(data) {
  const path = new Path2D();
  if (!data) {
    return path;
  }
  for (let i = 0, ii = data.length; i < ii;) {
    switch (data[i++]) {
      case DrawOPS.moveTo:
        path.moveTo(data[i++], data[i++]);
        break;
      case DrawOPS.lineTo:
        path.lineTo(data[i++], data[i++]);
        break;`,
    para: `function makePathFromDrawOPS(data, roundCap = false) {
  const path = new Path2D();
  if (!data) {
    return path;
  }
  // ${MARCA} (scripts/corrigir-pdfjs.mjs): a zero-length subpath with round caps must paint a dot
  // (PDF 8.5.3.2), but the canvas drops zero-length segments. Nudge it so both round caps are drawn.
  let previous = -1, startX = 0, startY = 0;
  for (let i = 0, ii = data.length; i < ii;) {
    const op = data[i++];
    const afterMoveTo = previous === DrawOPS.moveTo;
    previous = op;
    switch (op) {
      case DrawOPS.moveTo:
        path.moveTo(startX = data[i++], startY = data[i++]);
        break;
      case DrawOPS.lineTo: {
        const x = data[i++], y = data[i++];
        path.lineTo(roundCap && afterMoveTo && x === startX && y === startY ? x + Math.max(Math.abs(x), 1) * 2 ** -20 : x, y);
        break;
      }`,
  },
  {
    nome: "constructPath",
    de: `      path = data[0] = makePathFromDrawOPS(path);`,
    para: `      path = data[0] = makePathFromDrawOPS(path, this.ctx.lineCap === "round");`,
  },
];

function avisar(msg) {
  console.warn(`\n[corrigir-pdfjs] AVISO: ${msg}\n  Os pontos das linhas traço-ponto não vão aparecer no visualizador de PDF.\n  Refaça a correção em scripts/corrigir-pdfjs.mjs (o teste src/lib/pdfjs-ponto-degenerado.test.ts falha até lá).\n`);
}

if (!existsSync(ARQUIVO)) {
  avisar(`${ARQUIVO} não existe.`);
} else {
  let fonte = readFileSync(ARQUIVO, "utf8");
  if (fonte.includes(MARCA)) {
    console.log("Correção do pdf.js já aplicada.");
  } else {
    const faltando = TROCAS.filter((t) => fonte.split(t.de).length !== 2).map((t) => t.nome);
    if (faltando.length > 0) {
      avisar(`trecho de ${faltando.join(", ")} não encontrado (ou repetido) no pdf.js instalado — a biblioteca mudou.`);
    } else {
      for (const t of TROCAS) fonte = fonte.replace(t.de, () => t.para);
      writeFileSync(ARQUIVO, fonte);
      console.log("Correção do pdf.js aplicada (pontos de linha traço-ponto).");
    }
  }
}
