/**
 * Lê o texto selecionável de um PDF no cliente (pdfjs, carregado dinamicamente — mesmo padrão de
 * `documento-viewer.tsx`, para o stack de PDF ficar fora do bundle inicial).
 *
 * Devolve o texto corrido e também cada trecho com posição e giro. A posição é o que permite achar
 * um valor em layout de tabela/formulário (rótulo em cima, valor embaixo) — usada pela validade de
 * certidão (`modules/certidoes/extrair-validade.ts`) e pelo título do carimbo de prancha
 * (`modules/uploads/titulo-carimbo.ts`).
 *
 * NÃO é OCR: PDF escaneado (imagem) não tem camada de texto e devolve string vazia. A chamada pode
 * lançar (PDF corrompido acontece no acervo real), e quem chama trata como "sem sugestão" — está
 * sempre num fluxo de upload que não pode travar por causa da detecção.
 */

/** Trecho de texto do PDF com posição (coordenadas PDF: y cresce para cima). */
export interface ItemTextoPdf {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pagina: number;
  /**
   * Giro do texto em graus (0/90/180/270 nos casos que importam). Prancha de CAD plotada
   * costuma ter o carimbo deitado, e aí "a linha de baixo" não é `y` menor — ver
   * `titulo-carimbo.ts`. Ausente = texto normal (0).
   */
  giro?: number;
}

/** Giro do texto em graus a partir da matriz do pdfjs, normalizado para [0, 360). */
function giroDe(transform: number[]): number {
  const graus = Math.round((Math.atan2(transform[1], transform[0]) * 180) / Math.PI);
  return ((graus % 360) + 360) % 360;
}

export async function lerTextoPdf(file: File): Promise<{ texto: string; itens: ItemTextoPdf[] }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  // Quem libera o documento é a TAREFA de carregamento, não o documento: `PDFDocumentProxy` não
  // tem `destroy`. O código antigo chamava `doc.destroy?.()`, que era um no-op silencioso — e sem
  // liberar nada a memória de cada PDF lido ficava presa (dói num lote de pranchas de CAD).
  const tarefa = pdfjs.getDocument({ data: await file.arrayBuffer() });
  // pdfjs-dist tem tipos incômodos p/ uso solto (mesmo motivo de `documento-viewer.tsx` usar `any`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = await tarefa.promise;
  try {
    let texto = "";
    const itens: ItemTextoPdf[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, 2); i++) {
      const page = await doc.getPage(i);
      const conteudo = await page.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trechos = conteudo.items.filter((it: any) => "str" in it);
      texto += trechos.map((it: { str: string }) => it.str).join(" ") + " ";
      for (const it of trechos) {
        itens.push({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          w: it.width ?? 0,
          h: it.height || Math.abs(it.transform[3]) || 0,
          pagina: i,
          giro: giroDe(it.transform),
        });
      }
    }
    return { texto, itens };
  } finally {
    await tarefa.destroy();
  }
}
