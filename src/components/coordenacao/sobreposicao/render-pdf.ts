"use client";

// Rasteriza a página de um PDF UMA vez, tingida, para o palco compor com zoom/pan sem re-renderizar.
import { ehLayerArquitetura } from "@/modules/coordenacao/sobreposicao/regras";
import { hexParaRgb, tingir } from "@/modules/coordenacao/sobreposicao/pixels";
import type { Caixa } from "@/modules/coordenacao/sobreposicao/transformacao";

// pdf.js é carregado dinamicamente no cliente; os tipos dele ficam na borda.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

export type RenderPdf = {
  formato: "pdf";
  /** Folha tingida: alfa = tinta, RGB = cor atual (`cor`). */
  imagem: HTMLCanvasElement;
  /** Pixels da imagem por ponto PDF (espaço nativo da camada). */
  escalaRaster: number;
  /** A folha inteira, em pontos PDF (`getViewport({ scale: 1, rotation: 0 })`). */
  caixaNativa: Caixa;
  /** Fora da base, o PDF não tinha o grupo SENA_ARQ para esconder. */
  avisoArquitetura: boolean;
  numPaginas: number;
  cor: string;
};

/** Lado maior da imagem rasterizada, em px. */
const LADO_MAXIMO = 4096;
const ESCALA_MAXIMA = 4;
const MAX_EM_CACHE = 8;

const documentos = new Map<string, Promise<PdfDoc>>();
const rasters = new Map<string, Promise<RenderPdf>>();

const urlDoArquivo = (uploadId: string) => `/api/uploads/${uploadId}/download?disposition=inline`;

function documento(uploadId: string): Promise<PdfDoc> {
  let p = documentos.get(uploadId);
  if (!p) {
    p = (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs.getDocument({ url: urlDoArquivo(uploadId) }).promise;
    })();
    p.catch(() => documentos.delete(uploadId));
  }
  // O mais usado por último fica no fim; acima do limite, o mais antigo é fechado (libera o worker).
  documentos.delete(uploadId);
  documentos.set(uploadId, p);
  while (documentos.size > MAX_EM_CACHE) {
    const antigo = documentos.keys().next().value as string;
    documentos.get(antigo)?.then((d) => d?.destroy?.(), () => {});
    documentos.delete(antigo);
  }
  return p;
}

/** Mantém no máximo MAX_EM_CACHE folhas no cache (a usada há mais tempo sai; o GC a leva quando ninguém a desenha). */
function guardar(chave: string, p: Promise<RenderPdf>) {
  rasters.delete(chave);
  rasters.set(chave, p);
  while (rasters.size > MAX_EM_CACHE) rasters.delete(rasters.keys().next().value as string);
}

async function rasterizar(uploadId: string, pagina: number, esconderArquitetura: boolean, cor: string): Promise<RenderPdf> {
  const pdf = await documento(uploadId);
  const numPaginas: number = pdf.numPages;
  const page = await pdf.getPage(Math.min(Math.max(1, pagina), numPaginas));
  const base = page.getViewport({ scale: 1, rotation: 0 });
  const escala = Math.min(LADO_MAXIMO / Math.max(base.width, base.height), ESCALA_MAXIMA);
  const viewport = page.getViewport({ scale: escala, rotation: 0 });

  // Fora da base, o grupo SENA_ARQ (se o PDF foi exportado com layers) fica invisível.
  let avisoArquitetura = false;
  let configPromise: Promise<unknown> | undefined;
  if (esconderArquitetura) {
    const config = await pdf.getOptionalContentConfig();
    let achou = false;
    for (const [id, grupo] of [...config] as [string, { name?: string }][]) {
      if (ehLayerArquitetura(grupo.name ?? "")) {
        config.setVisibility(id, false);
        achou = true;
      }
    }
    avisoArquitetura = !achou;
    configPromise = Promise.resolve(config);
  }

  const imagem = document.createElement("canvas");
  imagem.width = Math.max(1, Math.floor(viewport.width));
  imagem.height = Math.max(1, Math.floor(viewport.height));
  const ctx = imagem.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D indisponível.");
  // Papel: sem fundo branco, o transparente leria como preto (luminância 0) e viraria tinta.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, imagem.width, imagem.height);
  await page.render({ canvasContext: ctx, viewport, optionalContentConfigPromise: configPromise }).promise;

  const dados = ctx.getImageData(0, 0, imagem.width, imagem.height);
  tingir(dados.data, hexParaRgb(cor));
  ctx.putImageData(dados, 0, 0);

  return {
    formato: "pdf",
    imagem,
    escalaRaster: escala,
    caixaNativa: { minX: 0, minY: 0, maxX: base.width, maxY: base.height },
    avisoArquitetura,
    numPaginas,
    cor,
  };
}

/** A folha tingida da página; reaproveita a do cache (só troca a cor, se mudou). */
export async function renderPdf(opts: {
  uploadId: string;
  pagina: number;
  esconderArquitetura: boolean;
  cor: string;
}): Promise<RenderPdf> {
  const chave = `${opts.uploadId}:${opts.pagina}:${opts.esconderArquitetura ? 1 : 0}`;
  let p = rasters.get(chave);
  if (!p) {
    p = rasterizar(opts.uploadId, opts.pagina, opts.esconderArquitetura, opts.cor);
    p.catch(() => rasters.delete(chave));
  }
  guardar(chave, p);
  const r = await p;
  colorir(r, opts.cor);
  return r;
}

/**
 * Troca a cor no lugar: o alfa guarda a tinta inteira, então basta repintar o RGB
 * (`source-in` mantém o alfa de cada pixel). Sem rasterizar de novo.
 */
export function colorir(r: RenderPdf, cor: string): void {
  if (r.cor === cor) return;
  const ctx = r.imagem.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = cor;
  ctx.fillRect(0, 0, r.imagem.width, r.imagem.height);
  ctx.restore();
  r.cor = cor;
}
