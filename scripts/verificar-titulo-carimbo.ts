/**
 * Confere o extrator de título do carimbo (`modules/uploads/titulo-carimbo.ts`) contra os PDFs
 * de prancha REAIS do storage — o mesmo arnês com que a heurística foi calibrada (2026-09-17).
 *
 * Por que existe: os testes unitários usam coordenadas transcritas à mão de alguns arquivos. Eles
 * provam que a regra funciona naqueles casos, mas NÃO pegam regressão no acervo — mexer em um
 * limiar (a janela de 2,5 alturas de linha, o `limiteDireita`, a lacuna que separa células) pode
 * quebrar uma família inteira de pranchas e todos os testes continuarem verdes. Rode isto antes e
 * depois de mexer na heurística e compare as duas saídas.
 *
 * Só leitura: não grava nada, não altera documento nenhum.
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/verificar-titulo-carimbo.ts [filtro-do-nome]
 *
 * Referência da calibração original (acervo de dev, 4 escritórios): 59 com título, 21 sem,
 * nenhum falso-positivo conhecido. "Sem título" é resultado seguro e esperado para lista de
 * material (A4), documento que não é prancha e carimbo de layout desconhecido.
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { ItemTextoPdf } from "@/lib/ler-texto-pdf";
import { extrairTituloDoCarimbo } from "@/modules/uploads/titulo-carimbo";

type ItemPdfJs = {
  str?: string;
  transform: number[];
  width?: number;
  height?: number;
};

/** Giro do texto em graus, normalizado para [0, 360) — igual ao de `lib/ler-texto-pdf.ts`. */
function giroDe(transform: number[]): number {
  const graus = Math.round((Math.atan2(transform[1], transform[0]) * 180) / Math.PI);
  return ((graus % 360) + 360) % 360;
}

/**
 * Lê os trechos de texto da 1ª página no MESMO formato que `lerTextoPdf` produz no navegador.
 * Devolve `null` quando o arquivo não existe ou o PDF está corrompido (acontece no acervo real).
 */
async function itensDaPrimeiraPagina(caminhoCompleto: string): Promise<ItemTextoPdf[] | null> {
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(caminhoCompleto);
  } catch {
    return null;
  }
  let tarefa: Awaited<ReturnType<typeof import("pdfjs-dist/legacy/build/pdf.mjs")["getDocument"]>> | null = null;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Libera pela tarefa, não pelo documento (`PDFDocumentProxy` não tem `destroy`) — senão
    // o worker de cada PDF fica vivo e a varredura do acervo inteiro come memória à toa.
    tarefa = pdfjs.getDocument({ data: new Uint8Array(bytes) });
    const doc = await tarefa.promise;
    const page = await doc.getPage(1);
    const conteudo = await page.getTextContent();
    const itens = (conteudo.items as ItemPdfJs[])
      .filter((item): item is ItemPdfJs & { str: string } => typeof item.str === "string")
      .map((item) => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        w: item.width ?? 0,
        h: item.height || Math.abs(item.transform[3]) || 0,
        pagina: 1,
        giro: giroDe(item.transform),
      }));
    return itens;
  } catch (erro) {
    if (process.env.DEBUG) console.error(`[debug] ${caminhoCompleto}:`, erro);
    return null;
  } finally {
    await tarefa?.destroy().catch(() => {});
  }
}

async function main() {
  const filtro = process.argv[2] ?? "";
  const uploads = await prisma.upload.findMany({
    where: filtro
      ? { AND: [{ nomeArquivo: { contains: filtro } }, { nomeArquivo: { endsWith: ".pdf" } }] }
      : { nomeArquivo: { endsWith: ".pdf" } },
    select: { nomeArquivo: true, caminho: true },
    orderBy: { createdAt: "desc" },
  });
  const base = process.env.STORAGE_BASE_PATH ?? "";
  if (!base) throw new Error("STORAGE_BASE_PATH não definido.");

  const jaVistos = new Set<string>();
  let comTitulo = 0;
  let semTitulo = 0;
  let ilegiveis = 0;

  for (const upload of uploads) {
    if (jaVistos.has(upload.caminho)) continue; // mesmo arquivo em várias revisões
    jaVistos.add(upload.caminho);

    const itens = await itensDaPrimeiraPagina(path.join(base, upload.caminho));
    if (!itens) {
      ilegiveis += 1;
      console.log(`ILEGÍVEL  ${upload.nomeArquivo}`);
      continue;
    }
    const titulo = extrairTituloDoCarimbo(itens);
    if (titulo) comTitulo += 1;
    else semTitulo += 1;
    console.log(`${titulo ? "OK  " : "--  "} ${upload.nomeArquivo.padEnd(38)} ${titulo ?? ""}`);
  }

  console.log(`\ncom título: ${comTitulo}   sem título: ${semTitulo}   ilegíveis: ${ilegiveis}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
