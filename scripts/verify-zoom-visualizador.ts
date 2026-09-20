/**
 * Prova do zoom do visualizador (doc-viewport.tsx) no Chrome de verdade.
 *
 * O tsc e os testes puros não cobrem o que importa aqui: se o Ctrl+roda é MESMO impedido de dar
 * zoom na página, se o ponto sob o cursor fica parado, e se o PDF continua em tamanho real. Este
 * script empacota o componente real (esbuild), monta numa página com um "desenho" do tamanho de
 * uma folha A0 e mede tudo no layout.
 *
 * O CSS é o mínimo para os utilitários Tailwind que o componente usa + as regras REAIS de
 * `@media print` extraídas do globals.css (é o que o PDF usa; se alguém mexer lá, isto acusa).
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/verify-zoom-visualizador.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";

const RAIZ = path.resolve(__dirname, "..");
const A0 = { largura: 3179, altura: 4494 };

let ok = true;
const check = (nome: string, cond: boolean, detalhe = "") => {
  console.log(`${cond ? "[OK]  " : "[FALHA]"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) ok = false;
};

/** Bloco `@media print { ... }` do globals.css, com chaves balanceadas. */
function blocoPrintDoGlobals(): string {
  const css = readFileSync(path.join(RAIZ, "src/app/globals.css"), "utf8");
  const ini = css.indexOf("@media print");
  if (ini < 0) throw new Error("sem @media print no globals.css");
  let prof = 0;
  for (let i = css.indexOf("{", ini); i < css.length; i++) {
    if (css[i] === "{") prof++;
    if (css[i] === "}" && --prof === 0) return css.slice(ini, i + 1);
  }
  throw new Error("@media print sem fechamento");
}

async function main() {
  const chrome = process.env.CHROME_PATH;
  if (!chrome) throw new Error("CHROME_PATH ausente");

  // Entrada sintética: o componente real + um desenho do tamanho de uma A0.
  const entrada = `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { DocViewport } from "@/components/documentos/doc-viewport";
    createRoot(document.getElementById("raiz")!).render(
      <DocViewport>
        <div id="desenho" style={{ width: ${A0.largura}, height: ${A0.altura}, background: "#fff" }}>
          <div id="alvo" style={{ position: "absolute", left: 1500, top: 2000, width: 40, height: 40, background: "red" }} />
        </div>
      </DocViewport>
    );
  `;
  const r = await build({
    stdin: { contents: entrada, resolveDir: RAIZ, sourcefile: "harness.tsx", loader: "tsx" },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    tsconfig: path.join(RAIZ, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"' },
    logLevel: "error",
  });
  const js = r.outputFiles[0].text;

  const CSS = `
    body { margin: 0; font-family: sans-serif; }
    .space-y-2 > * + * { margin-top: 8px; }
    .flex { display: flex; } .flex-wrap { flex-wrap: wrap; } .items-center { align-items: center; }
    .overflow-auto { overflow: auto; } .mx-auto { margin-left: auto; margin-right: auto; }
    .rounded-sm { border-radius: 2px; } .border { border: 1px solid #ccc; }
    .cursor-grabbing { cursor: grabbing; }
    [class*="max-h-"] { max-height: 500px; }
    #raiz { padding: 16px; width: 1000px; }
    #desenho { position: relative; }
    ${blocoPrintDoGlobals()}
  `;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
    <body><div id="raiz"></div><script>${js.replace(/<\/script>/g, "<\\/script>")}</script></body></html>`;

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 900 });
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(String(e)));
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForSelector("#desenho");
    await new Promise((res) => setTimeout(res, 200));

    const visor = () =>
      page.evaluate(() => {
        const v = document.querySelector(".doc-zoom-visor") as HTMLElement;
        const c = document.querySelector(".doc-zoom-conteudo") as HTMLElement;
        const alvo = document.getElementById("alvo")!.getBoundingClientRect();
        const vr = v.getBoundingClientRect();
        return {
          escala: new DOMMatrix(getComputedStyle(c).transform).a,
          scrollLeft: v.scrollLeft,
          scrollTop: v.scrollTop,
          scrollWidth: v.scrollWidth,
          // CENTRO do alvo: é o ponto sob o cursor no teste. O canto se afasta dele com o zoom.
          alvoX: alvo.left + alvo.width / 2 - vr.left,
          alvoY: alvo.top + alvo.height / 2 - vr.top,
          zoomDaPagina: window.visualViewport?.scale ?? 1,
        };
      });

    // 1. abre ajustado à largura
    const inicial = await visor();
    const esperado = (1000 - 32 - 2) / A0.largura; // raiz 1000 − padding 32 − borda do visor
    check("abre ajustado à largura do visor (A0 não abre em 1:1)", Math.abs(inicial.escala - esperado) < 0.02, `escala ${inicial.escala.toFixed(3)}`);

    // 2. Ctrl+roda: o evento tem de ser cancelado (senão o Chrome dá zoom na PÁGINA inteira)
    const cancelou = await page.evaluate(() => {
      const v = document.querySelector(".doc-zoom-visor")!;
      const ev = new WheelEvent("wheel", { deltaY: -300, ctrlKey: true, bubbles: true, cancelable: true, clientX: 300, clientY: 200 });
      v.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    check("Ctrl+roda é cancelado (o zoom do navegador na página não acontece)", cancelou);

    // 3. roda SEM Ctrl não pode ser cancelada — tem de continuar rolando o documento
    const semCtrl = await page.evaluate(() => {
      const v = document.querySelector(".doc-zoom-visor")!;
      const ev = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
      v.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    check("roda sem Ctrl não é cancelada (rolagem normal preservada)", !semCtrl);

    // 4. zoom no cursor: o ponto sob o cursor fica parado
    await page.evaluate(() => (document.querySelector(".doc-zoom-visor") as HTMLElement).scrollTo(0, 0));
    await page.evaluate(() => document.querySelector("button")?.blur());
    // vai para 100% e centraliza no alvo para o teste ter folga de rolagem nos dois sentidos
    const botoes = await page.$$("button");
    for (const b of botoes) {
      const t = await b.evaluate((el) => el.textContent?.trim());
      if (t === "100%") await b.click();
    }
    await new Promise((res) => setTimeout(res, 100));
    await page.evaluate(() => {
      const v = document.querySelector(".doc-zoom-visor") as HTMLElement;
      v.scrollTo(1500 - v.clientWidth / 2, 2000 - v.clientHeight / 2);
    });
    await new Promise((res) => setTimeout(res, 50));
    const antes = await visor();
    const cx = antes.alvoX, cy = antes.alvoY; // centro do alvo, em coordenadas do visor
    const box = await page.evaluate(() => {
      const v = document.querySelector(".doc-zoom-visor")!.getBoundingClientRect();
      return { left: v.left, top: v.top };
    });
    await page.evaluate(
      (x, y) => {
        const v = document.querySelector(".doc-zoom-visor")!;
        for (let i = 0; i < 5; i++)
          v.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true, clientX: x, clientY: y }));
      },
      box.left + cx,
      box.top + cy,
    );
    await new Promise((res) => setTimeout(res, 150));
    const depois = await visor();
    check("zoom aproximou (5 cliques)", depois.escala > antes.escala * 1.5, `${antes.escala.toFixed(3)} → ${depois.escala.toFixed(3)}`);
    check(
      "o ponto sob o cursor ficou parado (zoom no cursor, como CAD)",
      Math.abs(depois.alvoX - antes.alvoX) < 3 && Math.abs(depois.alvoY - antes.alvoY) < 3,
      `alvo em (${antes.alvoX.toFixed(1)}, ${antes.alvoY.toFixed(1)}) → (${depois.alvoX.toFixed(1)}, ${depois.alvoY.toFixed(1)})`,
    );
    check("a página do navegador não mudou de escala", Math.abs(depois.zoomDaPagina - 1) < 0.001);
    check("a área rolável cresceu junto com o zoom (não fica com o tamanho sem zoom)", depois.scrollWidth > antes.scrollWidth);

    // 5. PDF: o zoom é só de tela — impresso, tem de sair em tamanho real
    await page.emulateMediaType("print");
    const impresso = await page.evaluate(() => {
      const c = document.querySelector(".doc-zoom-conteudo") as HTMLElement;
      const s = document.querySelector(".doc-zoom-sizer") as HTMLElement;
      const d = document.getElementById("desenho")!.getBoundingClientRect();
      return {
        escala: new DOMMatrix(getComputedStyle(c).transform).a,
        larguraDesenho: d.width,
        alturaDesenho: d.height,
        alturaSizer: s.getBoundingClientRect().height,
      };
    });
    check("impresso: sem escala aplicada", Math.abs(impresso.escala - 1) < 0.001, `escala ${impresso.escala}`);
    check(
      "impresso: desenho em tamanho real (A0)",
      Math.abs(impresso.larguraDesenho - A0.largura) < 1 && Math.abs(impresso.alturaDesenho - A0.altura) < 1,
      `${impresso.larguraDesenho}×${impresso.alturaDesenho}`,
    );
    check("impresso: a caixa acompanha o desenho, sem cortar", impresso.alturaSizer >= A0.altura - 1, `${Math.round(impresso.alturaSizer)}px`);

    check("sem erro de JavaScript na página", erros.length === 0, erros.join(" | "));
  } finally {
    await browser.close();
  }

  console.log(`\n${ok ? "✔ Zoom: tudo verde." : "✖ Zoom: há falhas acima."}`);
  if (!ok) process.exitCode = 1;
}

main();
