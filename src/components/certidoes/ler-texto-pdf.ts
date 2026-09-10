/**
 * Lê o texto selecionável de um PDF no cliente (pdfjs, carregado dinamicamente — mesmo padrão de
 * `documento-viewer.tsx`, para o stack de PDF ficar fora do bundle inicial).
 *
 * NÃO é OCR: PDF escaneado (imagem) não tem camada de texto e devolve string vazia. A chamada pode
 * lançar, e quem chama trata como "sem sugestão" — está sempre num fluxo de upload que não pode
 * travar por causa da detecção.
 *
 * Vive em arquivo próprio porque o cadastro (§12) e a atualização de versão (§15) usam os dois.
 */
export async function lerTextoPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  // pdfjs-dist tem tipos incômodos p/ uso solto (mesmo motivo de `documento-viewer.tsx` usar `any`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    let texto = "";
    for (let i = 1; i <= Math.min(doc.numPages, 2); i++) {
      const page = await doc.getPage(i);
      const conteudo = await page.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      texto += conteudo.items.map((it: any) => ("str" in it ? it.str : "")).join(" ") + " ";
    }
    return texto;
  } finally {
    doc.destroy?.();
  }
}
