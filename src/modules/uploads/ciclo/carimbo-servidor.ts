import "server-only";
import { promises as fs } from "node:fs";
import type { ItemTextoPdf } from "@/lib/ler-texto-pdf";
import { resolverCaminho } from "@/lib/storage";
import { lerCarimbo, LEITURA_VAZIA, type LeituraCarimbo } from "./carimbo";

/**
 * Lê o carimbo de um PDF do storage, NO SERVIDOR (o envio para análise não pode confiar no navegador).
 * pdfjs no build `legacy`, que roda em Node sem worker do navegador; `pdfjs-dist` fica fora do bundle do
 * servidor (`serverExternalPackages` em next.config.ts). Só a 1ª página: é onde fica o carimbo.
 *
 * Nunca lança: PDF corrompido, arquivo sumido ou leitura lenta viram "sem texto", e a regra pede
 * confirmação em vez de bloquear (D9).
 */
const LIMITE_MS = 20_000;

function giroDe(transform: number[]): number {
  const graus = Math.round((Math.atan2(transform[1], transform[0]) * 180) / Math.PI);
  return ((graus % 360) + 360) % 360;
}

async function itensDaPrimeiraPagina(caminho: string): Promise<ItemTextoPdf[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await fs.readFile(resolverCaminho(caminho)));
  const tarefa = pdfjs.getDocument({ data, useSystemFonts: false });
  try {
    const doc = await tarefa.promise;
    const pagina = await doc.getPage(1);
    const conteudo = await pagina.getTextContent();
    const itens: ItemTextoPdf[] = [];
    for (const it of conteudo.items) {
      if (!("str" in it)) continue;
      itens.push({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        w: it.width,
        h: it.height,
        pagina: 1,
        giro: giroDe(it.transform),
      });
    }
    return itens;
  } finally {
    await tarefa.destroy();
  }
}

export async function lerCarimboDoArquivo(caminho: string): Promise<LeituraCarimbo> {
  try {
    const itens = await Promise.race([
      itensDaPrimeiraPagina(caminho),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), LIMITE_MS)),
    ]);
    return lerCarimbo(itens);
  } catch (err) {
    console.error("[ciclo-documental] leitura do carimbo falhou:", err);
    return LEITURA_VAZIA;
  }
}
