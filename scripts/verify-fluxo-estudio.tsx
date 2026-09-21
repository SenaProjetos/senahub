/**
 * Prova da G0 (faixa em fluxo, ADR-0006), contra o banco de dev:
 *
 * 1. **Nada mudou para quem já existe** — renderiza os modelos salvos (nenhum tem `fluxo`) e
 *    grava o HTML em `--saida`. Rodando antes e depois da mudança, os arquivos têm de ser
 *    idênticos (`diff`). É o que separa "opção nova" de "mexeu no motor de todo mundo".
 * 2. **Texto longo sai inteiro** — um modelo sintético com parágrafo de 40 linhas: em faixa
 *    normal o HTML vem com `overflow:hidden` e altura fixa (corta na tela e no PDF); em faixa
 *    em fluxo, sem corte e com o texto todo presente.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/verify-fluxo-estudio.tsx --saida <pasta>
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import puppeteer from "puppeteer-core";
import { prisma } from "../src/lib/prisma";
import { DocRender } from "../src/components/documentos/doc-render";
import { docSchemaZ, type DocSchema } from "../src/modules/documentos/schema";

const saida = process.argv[process.argv.indexOf("--saida") + 1] ?? "";
if (!saida) throw new Error("informe --saida <pasta>");
mkdirSync(saida, { recursive: true });

const estilo = {
  fontSize: 11, bold: false, italic: false, align: "left" as const, color: "", bg: "",
  borderW: 0, borderColor: "#1C2D58", borderStyle: "solida" as const, radius: 0, fontFamily: "",
};
const paragrafo = (linhas: number) =>
  Array.from(
    { length: linhas },
    (_, i) => `Linha ${i + 1} da cláusula: texto longo que existe justamente para passar da altura desenhada.`,
  ).join(" ");
const PARAGRAFO_LONGO = paragrafo(40);
/** Passa de uma folha A4 inteira — é o caso que testa a quebra de página. */
const PARAGRAFO_DUAS_PAGINAS = paragrafo(200);

function modeloDeTeste(fluxo: boolean, texto = PARAGRAFO_LONGO): DocSchema {
  return docSchemaZ.parse({
    versao: 1,
    pagina: {
      formato: "A4", orientacao: "retrato", largura: 794, altura: 1123,
      margem: { topo: 48, direita: 48, baixo: 48, esquerda: 48 },
    },
    bandas: [
      {
        id: "b1", tipo: "cabecalho", altura: 120, fluxo: fluxo || undefined,
        elementos: [
          { id: "e1", tipo: "label", x: 0, y: 0, w: 600, h: 24, texto: "TÍTULO", estilo, visivel: true, travado: false },
          { id: "e2", tipo: "paragrafo", x: 0, y: 40, w: 600, h: 60, texto, estilo, visivel: true, travado: false },
          { id: "e3", tipo: "label", x: 0, y: 110, w: 600, h: 20, texto: "DEPOIS DO TEXTO", estilo, visivel: true, travado: false },
        ],
      },
    ],
  });
}

async function main() {
  const modelos = await prisma.documentoModelo.findMany({ orderBy: { nome: "asc" }, select: { nome: true, schemaJson: true } });
  let ok = true;
  const check = (nome: string, cond: boolean, detalhe = "") => {
    console.log(`${cond ? "[OK]  " : "[FALHA]"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
    if (!cond) ok = false;
  };

  let renderizados = 0;
  for (const m of modelos) {
    const parsed = docSchemaZ.safeParse(m.schemaJson);
    if (!parsed.success) {
      // Modelo salvo que o schema atual recusa (ex.: banda mais alta que o max do zod). Não é da
      // G0 — mas fica registrado, porque a comparação antes/depois não o cobre.
      console.log(`[AVISO] modelo "${m.nome}" não passa no schema atual: ${parsed.error.issues[0]?.message}`);
      continue;
    }
    const html = renderToStaticMarkup(<DocRender schema={parsed.data} escalar={{}} linhas={[]} />);
    writeFileSync(path.join(saida, `${m.nome.replace(/[^a-zA-Z0-9]+/g, "_")}.html`), html);
    renderizados++;
  }
  console.log(`\n${renderizados} de ${modelos.length} modelo(s) renderizado(s) em ${saida} — compare com a execução anterior (diff).\n`);

  const fixo = renderToStaticMarkup(<DocRender schema={modeloDeTeste(false)} escalar={{}} linhas={[]} />);
  const fluido = renderToStaticMarkup(<DocRender schema={modeloDeTeste(true)} escalar={{}} linhas={[]} />);
  const ultimaLinha = "Linha 40 da cláusula";

  check("faixa normal continua com altura fixa e corte (comportamento de sempre)", fixo.includes("height:120px") && fixo.includes("overflow:hidden"));
  check("faixa em fluxo não corta o texto", !fluido.includes("overflow:hidden"));
  check("faixa em fluxo tem altura mínima, não fixa", fluido.includes("min-height:120px") && !fluido.includes("height:120px;"));
  check("o texto longo está inteiro nos dois (o corte é visual)", fixo.includes(ultimaLinha) && fluido.includes(ultimaLinha));
  check("em fluxo, o elemento seguinte vem depois do texto (empilhado, não sobreposto)", fluido.indexOf("DEPOIS DO TEXTO") > fluido.indexOf(ultimaLinha));
  check("faixa normal mantém posição absoluta", /class="[^"]*absolute"/.test(fixo));
  check("faixa em fluxo não usa posição absoluta nos elementos", !/class="[^"]*absolute"/.test(fluido));

  // -- Prova de LAYOUT (a que vale) ------------------------------------------------------
  // As checagens acima leem o HTML; corte quem decide e o layout, no Chrome. Aqui o mesmo HTML
  // e medido de verdade: scrollHeight > clientHeight = conteudo cortado.
  // O CSS abaixo e o minimo que o markup do Estudio usa das classes utilitarias (position) mais
  // as regras de impressao do globals.css -- sem o Tailwind construido, `absolute` seria inerte
  // e a faixa normal empilharia por acidente, invalidando a comparacao.
  const chrome = process.env.CHROME_PATH;
  if (!chrome) {
    console.log("\n[AVISO] CHROME_PATH ausente -- prova de layout nao executada.");
    ok = false;
  } else {
    const CSS = `
      body { margin: 0; }
      .relative { position: relative; }
      .absolute { position: absolute; }
      .mx-auto { margin-left: auto; margin-right: auto; }
      .bg-white { background: #fff; }
      .text-black { color: #000; }
      .doc-tabela thead { display: table-header-group; }
      .doc-tabela tr { break-inside: avoid; }
      @page { size: A4; margin: 0; }
    `;
    const paginaHtml = (corpo: string) =>
      `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${corpo}</body></html>`;
    const browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const medir = async (html: string) => {
        const page = await browser.newPage();
        await page.setViewport({ width: 900, height: 1200 });
        await page.setContent(paginaHtml(html), { waitUntil: "load" });
        await page.emulateMediaType("print");
        const m = await page.evaluate(() => {
          const divs = Array.from(document.querySelectorAll("div"));
          const par = divs.find(
            (d) => d.children.length === 0 && (d.textContent ?? "").startsWith("Linha 1 da"),
          );
          const seguinte = Array.from(document.querySelectorAll("span")).find(
            (e) => e.textContent === "DEPOIS DO TEXTO",
          );
          const folha = document.querySelector(".doc-pagina") as HTMLElement | null;
          if (!par || !seguinte || !folha) return null;
          const rp = par.getBoundingClientRect();
          const rs = seguinte.getBoundingClientRect();
          return {
            cortado: par.scrollHeight > par.clientHeight + 1,
            alturaTexto: par.scrollHeight,
            alturaCaixa: par.clientHeight,
            sobreposto: rs.top < rp.bottom - 1,
            alturaFolha: folha.getBoundingClientRect().height,
          };
        });
        if (!m) throw new Error("nao achei o paragrafo/elemento seguinte/folha no HTML medido");
        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });
        // Paginas do PDF: objetos "/Type /Page" (o "/Pages" da arvore nao conta).
        const paginas = (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
        await page.close();
        return { ...m, paginas };
      };

      const mFixo = await medir(fixo);
      const mFluido = await medir(fluido);

      check(
        "LAYOUT: faixa normal corta o texto (o defeito que a G0 resolve)",
        mFixo.cortado,
        `${mFixo.alturaTexto}px de texto em caixa de ${mFixo.alturaCaixa}px`,
      );
      check(
        "LAYOUT: faixa em fluxo NAO corta o texto",
        !mFluido.cortado,
        `${mFluido.alturaTexto}px de texto, caixa de ${mFluido.alturaCaixa}px`,
      );
      check("LAYOUT: em fluxo o elemento seguinte nao fica por cima do texto", !mFluido.sobreposto);
      // Texto maior que uma folha inteira: a faixa em fluxo tem de empurrar a folha e quebrar
      // para a 2a pagina. E o que valida a remocao do `break-inside: avoid` nessa faixa.
      const mFixoLongo = await medir(
        renderToStaticMarkup(
          <DocRender schema={modeloDeTeste(false, PARAGRAFO_DUAS_PAGINAS)} escalar={{}} linhas={[]} />,
        ),
      );
      const mFluidoLongo = await medir(
        renderToStaticMarkup(
          <DocRender schema={modeloDeTeste(true, PARAGRAFO_DUAS_PAGINAS)} escalar={{}} linhas={[]} />,
        ),
      );
      check(
        "LAYOUT: em fluxo a folha cresce alem da altura desenhada (texto de 2 paginas)",
        mFluidoLongo.alturaFolha > mFixoLongo.alturaFolha,
        `${Math.round(mFixoLongo.alturaFolha)}px na faixa normal -> ${Math.round(mFluidoLongo.alturaFolha)}px em fluxo`,
      );
      check(
        "LAYOUT: o texto de 2 paginas quebra mesmo, no PDF",
        mFluidoLongo.paginas >= 2 && mFixoLongo.paginas === 1,
        `${mFixoLongo.paginas} pagina(s) na faixa normal (o resto do texto se perde), ${mFluidoLongo.paginas} em fluxo`,
      );
    } finally {
      await browser.close();
    }
  }

  console.log(`\n${ok ? "✔ Fluxo: tudo verde." : "✖ Fluxo: há falhas acima."}`);
  if (!ok) process.exitCode = 1;
  await prisma.$disconnect();
}

main();
