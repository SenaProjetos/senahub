"use client";

// Rasteriza a página de um PDF UMA vez, tingida, para o palco compor com zoom/pan sem re-renderizar.
import { ehLayerArquitetura, rotacaoDaFolha } from "@/modules/coordenacao/sobreposicao/regras";
import { hexParaRgb, tingir } from "@/modules/coordenacao/sobreposicao/pixels";
import { criarPiscina } from "@/modules/coordenacao/sobreposicao/piscina";
import type { Caixa } from "@/modules/coordenacao/sobreposicao/transformacao";

// pdf.js é carregado dinamicamente no cliente; os tipos dele ficam na borda.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

/** Tamanho da página em pontos PDF, com o `/Rotate` dela (`rotacaoDaFolha`) — o espaço de `Pendencia.x/y`. */
export type TamanhoPdf = { largura: number; altura: number };

export type RenderPdf = {
  formato: "pdf";
  /** Folha tingida: alfa = tinta, RGB = cor atual (`cor`). */
  imagem: HTMLCanvasElement;
  /** Pixels da imagem por ponto PDF (espaço nativo da camada). */
  escalaRaster: number;
  /** A folha inteira, em pontos PDF, com o `/Rotate` da página (`rotacaoDaFolha`). */
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

const rasters = new Map<string, Promise<RenderPdf>>();
/** Tamanho de cada página já lida, por `uploadId:pagina` (não muda: o arquivo de um upload nunca muda). */
const tamanhos = new Map<string, Promise<TamanhoPdf>>();

const urlDoArquivo = (uploadId: string) => `/api/uploads/${uploadId}/download?disposition=inline`;

/**
 * Documentos abertos no pdf.js, por uploadId, com contagem de uso: rasterizar e ler o tamanho da página
 * correm ao mesmo tempo, e só o último a soltar destrói (libera o worker). O cache por idade de antes
 * destruía documento em uso quando a cena tinha mais de 8 PDFs.
 */
const documentos = criarPiscina<PdfDoc>(
  async (uploadId) => {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return pdfjs.getDocument({ url: urlDoArquivo(uploadId) }).promise;
  },
  (pdf) => void pdf?.destroy?.(),
);

/** Mantém no máximo MAX_EM_CACHE folhas no cache (a usada há mais tempo sai; o GC a leva quando ninguém a desenha). */
function guardar(chave: string, p: Promise<RenderPdf>) {
  rasters.delete(chave);
  rasters.set(chave, p);
  while (rasters.size > MAX_EM_CACHE) rasters.delete(rasters.keys().next().value as string);
}

const chaveTamanho = (uploadId: string, pagina: number) => `${uploadId}:${pagina}`;

function rasterizar(uploadId: string, pagina: number, esconderArquitetura: boolean, cor: string): Promise<RenderPdf> {
  return documentos.usar(uploadId, (pdf) => rasterizarNo(pdf, uploadId, pagina, esconderArquitetura, cor));
}

async function rasterizarNo(
  pdf: PdfDoc,
  uploadId: string,
  pagina: number,
  esconderArquitetura: boolean,
  cor: string,
): Promise<RenderPdf> {
  const numPaginas: number = pdf.numPages;
  const page = await pdf.getPage(Math.min(Math.max(1, pagina), numPaginas));
  const rotation = rotacaoDaFolha(page.rotate);
  const base = page.getViewport({ scale: 1, rotation });
  // A folha já está aberta: guarda o tamanho da página (o pino da camada vai precisar dele sem reabrir o PDF).
  if (!tamanhos.has(chaveTamanho(uploadId, pagina))) {
    tamanhos.set(chaveTamanho(uploadId, pagina), Promise.resolve({ largura: base.width, altura: base.height }));
  }
  const escala = Math.min(LADO_MAXIMO / Math.max(base.width, base.height), ESCALA_MAXIMA);
  const viewport = page.getViewport({ scale: escala, rotation });

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

/** Tamanho da página em pontos PDF (o espaço de `Pendencia.x/y`), sem rasterizar; lido uma vez por página. */
export function tamanhoDaPagina(uploadId: string, pagina: number): Promise<TamanhoPdf> {
  const chave = chaveTamanho(uploadId, pagina);
  let p = tamanhos.get(chave);
  if (!p) {
    p = documentos.usar(uploadId, async (pdf) => {
      const page = await pdf.getPage(Math.min(Math.max(1, pagina), pdf.numPages));
      const v = page.getViewport({ scale: 1, rotation: rotacaoDaFolha(page.rotate) });
      return { largura: v.width, altura: v.height };
    });
    tamanhos.set(chave, p);
    // Falhou (rede): a próxima chamada tenta de novo.
    p.catch(() => {
      if (tamanhos.get(chave) === p) tamanhos.delete(chave);
    });
  }
  return p;
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
