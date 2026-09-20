/**
 * Prova de RENDERIZAÇÃO do documento da proposta composta (ADR-0006, G5).
 *
 * O smoke prova os dados; os testes provam as regras. Nenhum dos dois renderiza — e a suposição
 * estrutural da G5 é justamente de renderização: que uma banda de detalhe com
 * `fonteId: "proposta-secoes"` itera as seções via `porFonte`, e que o rodapé (tabela de valores,
 * plano, assinatura) sai uma vez, depois da última cláusula.
 *
 * Aqui o documento é renderizado de verdade (`DocRender`) e medido no Chrome, como
 * `verify-fluxo-estudio.tsx` faz: nada de conferir string e supor layout.
 *
 * **O que isto NÃO prova:** ele renderiza o layout de FÁBRICA (`modeloDocumentoProposta()`), e não
 * o que está salvo no banco. `carregarDocumentoProposta` prefere o `DocumentoModelo` salvo pelo
 * nome; hoje os dois são idênticos (o seed grava a fábrica), mas a gestão vai editar o layout no
 * Doc Studio, e a partir daí este script descreve a fábrica, não o que o cliente vê. O layout
 * salvo só se confere olhando a prévia (checklist, item E).
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/verify-documento-proposta.tsx
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import puppeteer from "puppeteer-core";
import { DocRender } from "../src/components/documentos/doc-render";
import { montarDocumento, type DadosEmpresaDocumento, type DadosPropostaDocumento } from "../src/modules/comercial/proposta-composta/documento";
import { modeloDocumentoProposta } from "../src/modules/comercial/proposta-composta/modelo-documento";

const RAIZ = path.resolve(__dirname, "..");
let ok = true;
const check = (nome: string, cond: boolean, detalhe = "") => {
  console.log(`${cond ? "[OK]  " : "[FALHA]"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) ok = false;
};

const empresa: DadosEmpresaDocumento = {
  razaoSocial: "Engenharia Exemplo Ltda.",
  cnpj: "00.000.000/0001-00",
  endereco: "Rua Exemplo, 100 — Maceió/AL",
  telefone: "(82) 3333-0000",
  email: "contato@exemplo.com.br",
  banco: "Banco do Brasil",
  agencia: "7474",
  conta: "12345-6",
  pix: null,
  responsavelNome: "Fulano de Tal",
  responsavelCargo: "Engenheiro civil",
  responsavelRegistro: "CREA-AL 12345",
};

/** Cláusula longa de propósito: é o caso que a faixa em fluxo (G0) existe para não cortar. */
const CLAUSULA_LONGA = Array.from(
  { length: 30 },
  (_, i) => `Item ${i + 1} do escopo contratado, descrito com o detalhamento que a proposta real costuma ter.`,
).join(" ");

const proposta: DadosPropostaDocumento = {
  numero: "PR-260042",
  titulo: "Projetos multidisciplinares",
  clienteNome: "Construtora Alfa",
  clienteDocumento: "11.111.111/0001-11",
  obraEndereco: "Quadra 6, Lote 15",
  obraCidade: "Maceió",
  obraUF: "AL",
  areaM2: 1200,
  validade: new Date(Date.UTC(2026, 9, 20)),
  itens: [
    { disciplina: "Estrutural", valor: 60_000 },
    { disciplina: "Elétrico", valor: 25_000 },
    { disciplina: "Hidrossanitário", valor: 15_000 },
  ],
  secoes: [
    { secao: "descricao", titulo: null, texto: "Objeto: elaboração dos projetos da obra." },
    { secao: "escopo", titulo: "Escopo — Estrutural", texto: CLAUSULA_LONGA },
    // Três cláusulas longas: o documento PRECISA passar de uma folha, senão a quebra da banda de
    // detalhe entre páginas nunca é exercitada (com uma só, tudo cabia em 1 página).
    { secao: "escopo", titulo: "Escopo — Elétrico", texto: CLAUSULA_LONGA },
    { secao: "escopo", titulo: "Escopo — Hidrossanitário", texto: CLAUSULA_LONGA },
    { secao: "nao_incluso", titulo: null, texto: "Taxas, aprovações e execução não estão inclusas." },
    { secao: "competencia_contratada", titulo: null, texto: "Entregar no prazo;\nRegistrar a ART." },
    { secao: "alteracoes", titulo: null, texto: "Alterações posteriores serão orçadas à parte." },
  ],
  parcelas: [
    { descricao: "Sinal, no aceite", percentual: 40, prazo: "à vista" },
    { descricao: "Pré-forma estrutural", percentual: 30 },
    { descricao: "Projetos executivos", percentual: 30 },
  ],
  total: 100_000,
  desconto: null,
};

/** Bloco `@media print { ... }` do globals.css — é o CSS que o PDF usa. */
function blocoPrint(): string {
  const css = readFileSync(path.join(RAIZ, "src/app/globals.css"), "utf8");
  const ini = css.indexOf("@media print");
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

  const schema = modeloDocumentoProposta();
  const doc = montarDocumento(proposta, empresa, new Date(Date.UTC(2026, 8, 20)));
  check("o documento não tem impedimento (a prova é de layout, não de dado)", doc.impedimentos.length === 0, doc.impedimentos.join(" | "));

  const html = renderToStaticMarkup(
    <DocRender
      schema={schema}
      escalar={doc.escalar}
      linhas={doc.linhas}
      porFonte={{ "proposta-secoes": { escalar: {}, linhas: doc.secoes } }}
    />,
  );

  const CSS = `
    body { margin: 0; background: #fff; }
    .relative { position: relative; }
    .absolute { position: absolute; }
    .mx-auto { margin-left: auto; margin-right: auto; }
    .bg-white { background: #fff; }
    .text-black { color: #000; }
    .doc-tabela thead { display: table-header-group; }
    .doc-tabela tr { break-inside: avoid; }
    @page { size: A4; margin: 0; }
    ${blocoPrint()}
  `;
  const pagina = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${html}</body></html>`;

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 1200 });
    await page.setContent(pagina, { waitUntil: "load" });
    await page.emulateMediaType("print");

    const m = await page.evaluate(() => {
      // Sem função nomeada aqui dentro: o esbuild do tsx injeta o helper `__name`, que não
      // existe no browser, e o `page.evaluate` estoura com "__name is not defined".
      const texto = document.body.innerText;
      const cortados = Array.from(document.querySelectorAll("div"))
        .filter((d) => d.children.length === 0 && d.textContent?.trim())
        .filter((d) => d.scrollHeight > d.clientHeight + 1)
        .map((d) => (d.textContent ?? "").slice(0, 40));
      return {
        texto,
        cortados,
        ocorrenciasEscopo: (texto.match(/Escopo — Estrutural/g) ?? []).length,
        ocorrenciasTabela: document.querySelectorAll("table").length,
        linhasTabela: document.querySelectorAll("table tbody tr").length,
        alturaTotal: document.body.scrollHeight,
        posUltimaClausula: texto.indexOf("Alterações posteriores"),
        posAssinatura: texto.indexOf("Fulano de Tal"),
        posTotal: texto.indexOf("cem mil reais"),
        posCabecalho: texto.indexOf("PROPOSTA PR-260042"),
      };
    });

    check("cada seção vira uma repetição da banda de detalhe", m.ocorrenciasEscopo === 1 && ["Objeto: elaboração", "Taxas, aprovações", "Registrar a ART", "Alterações posteriores"].every((t) => m.texto.includes(t)));
    check("a cláusula longa sai INTEIRA (faixa em fluxo da G0)", m.texto.includes("Item 30 do escopo contratado"));
    check("nada é cortado no layout", m.cortados.length === 0, m.cortados.join(" | "));
    check("a tabela de valores sai UMA vez, com uma linha por disciplina", m.ocorrenciasTabela === 1 && m.linhasTabela === 3, `${m.ocorrenciasTabela} tabela(s), ${m.linhasTabela} linha(s)`);
    check("o cabeçalho vem antes das cláusulas, e o rodapé depois da última", m.posCabecalho >= 0 && m.posCabecalho < m.posUltimaClausula && m.posUltimaClausula < m.posTotal);
    check("a assinatura é a última coisa do documento", m.posAssinatura > m.posTotal);
    check("o plano de pagamento sai com valor e extenso", m.texto.includes("40% — Sinal, no aceite") && m.texto.includes("quarenta mil reais"));
    check("os dados bancários saem do cadastro da empresa", m.texto.includes("Banco Banco do Brasil"));
    check("o documento passa de uma folha A4 — a faixa em fluxo empurrou a página", m.alturaTotal > 1219, `${m.alturaTotal}px`);

    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    const paginas = (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    check("o PDF sai com mais de uma página", paginas >= 2, `${paginas} página(s)`);
  } finally {
    await browser.close();
  }

  console.log(`\n${ok ? "✔ Documento da proposta: tudo verde." : "✖ Documento da proposta: há falhas acima."}`);
  if (!ok) process.exitCode = 1;
}

main();
